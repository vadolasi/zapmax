import { Elysia, t } from "elysia";
import { randomUUIDv7 } from "bun";
import type Whatsapp from "./worker";
import { Worker } from "worker_threads";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/esm/node-adapter";
import { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@grotto/logysia";
import { Worker as BullMQWorker, Job, Queue } from "bullmq";
import * as Minio from "minio";
import { Readable } from "stream";
import { msgpack } from "./msgpack";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: process.env.NODE_ENV === "production" ? 443 : 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!
})

const MINIO_BUCKET = process.env.MINIO_BUCKET!;

const REDIS_URL = process.env.REDIS_URL!;

const prisma = new PrismaClient();

const instances = new Map<string, Comlink.Remote<Whatsapp>>();

const savedInstances = await prisma.instance.findMany({ where: { active: true } });

for (const instance of savedInstances) {
  const worker = new Worker(
    new URL("./worker.ts", import.meta.url).pathname,
    { env: { INSTANCE_ID: instance.id } }
  );

  const whatsapp = Comlink.wrap<Whatsapp>(nodeEndpoint(worker));

  instances.set(instance.id, whatsapp);

  whatsapp.start();
}

const app = new Elysia({ prefix: "/api" })
  .use(logger())
  .use(msgpack({ moreTypes: true }))
  .group("/instances", (app) =>
    app
      .get("/", () => {
        return prisma.instance.findMany({ where: { active: true } });
      })
      .get("/:id/chats", ({ params }) => {
        const instanceId = params.id;

        return prisma.chat.findMany({ select: { id: true, name: true }, where: { instanceId } });
      })
      .post("/", async () => {
        const id = randomUUIDv7();

        await prisma.instance.create({
          data: {
            id
          },
        });

        const worker = new Worker(
          new URL("./worker.ts", import.meta.url).pathname,
          { env: { INSTANCE_ID: id } }
        );

        const whatsapp = Comlink.wrap<Whatsapp>(nodeEndpoint(worker));

        instances.set(id, whatsapp);

        whatsapp.start();

        return { instanceId: id };
      })
      .delete("/:id", (req) => {
        const instanceId = req.params.id;

        const whatsapp = instances.get(instanceId)!;

        whatsapp.terminate();

        instances.delete(instanceId);

        return { instanceId };
      })
      .ws("/:id", {
        perMessageDeflate: true,
        params: t.Object({ id: t.String() }),
        open: (ws) => {
          const instanceId = ws.data.params.id;

          const whatsapp = instances.get(instanceId);

          if (!whatsapp) {
            return ws.close(4000, "Instance not found");
          }

          const qrCallback = Comlink.proxy((qr: string) => ws.send({ type: "qr", qr }));
          const connectedCallback = Comlink.proxy(() => ws.send({ type: "connected" }));
          const disconnectedCallback = Comlink.proxy(() => ws.send({ type: "disconnected" }));

          whatsapp.on("qr", qrCallback);
          whatsapp.on("connected", connectedCallback);
          whatsapp.on("disconnected", disconnectedCallback);
        }
      })
  )
  .group("/schedulers", (app) =>
    app.get("/", () => {
      return prisma.scheduler.findMany();
    })
      .get("/:id", ({ params }) => {
        const schedulerId = params.id;

        return prisma.scheduler.findUnique({
          where: { id: schedulerId },
          include: {
            jobs: true,
            instances: {
              include: {
                Instance: true
              }
            }
          }
        });
      })
      .post("/", async ({ body }) => {
        const {
          chatId,
          messages,
          instances: instancesIds,
          mainInstance,
          blockAdms = true,
          minTimeBetweenParticipants,
          maxTimeBetweenParticipants,
          minTimeBetweenMessages,
          maxTimeBetweenMessages,
          minTimeTyping,
          maxTimeTyping
        } = body;

        const whatsapp = instances.get(mainInstance);

        if (!whatsapp) {
          return { error: "Instance not found" };
        }

        let participants = await whatsapp.fetchCommunityParticipants(chatId);

        if (blockAdms) {
          participants = participants.filter((participant) => !participant.isAdmin && !participant.isSuperAdmin);
        }

        const jobs: {
          [key: string]: {
            queueId: string,
            instanceId: string,
            jid: string,
            messages: any[],
            delay: number
          }[]
        } = {};

        for (const instanceId of instancesIds) {
          jobs[instanceId] = [];
        }

        let currentTime = Date.now();

        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i];
          const instanceId = instancesIds[i % instancesIds.length];

          const jobId = randomUUIDv7();

          const delay = Math.floor(
            Math.random() * (
              maxTimeBetweenParticipants - minTimeBetweenParticipants + 1
            )
          ) + minTimeBetweenParticipants;

          currentTime = currentTime + delay * 1000;

          jobs[instanceId].push({
            instanceId,
            queueId: jobId,
            jid: participant.id,
            messages,
            delay: currentTime - Date.now()
          });
        }

        const schedulerId = randomUUIDv7();

        await Promise.all(instancesIds.map(async (instanceId) => {
          const queue = new Queue(`zapmax-${instanceId}`, { connection: { url: REDIS_URL } });
          await Promise.all(jobs[instanceId].map((job) => queue.add(
            "send-messages",
            {
              jid: job.jid,
              messages: job.messages,
              schedulerId,
              minTimeBetweenMessages,
              maxTimeBetweenMessages,
              minTimeTyping,
              maxTimeTyping
            },
            {
              delay: job.delay,
              jobId: job.queueId,
              removeOnComplete: true
            }
          )));
        }));

        await prisma.scheduler.create({
          data: {
            id: schedulerId,
            instances: {
              createMany: {
                data: instancesIds.map((instanceId) => ({ instanceId }))
              }
            },
            jid: chatId,
            messages: messages as Prisma.JsonArray,
            minTimeBetweenParticipants,
            maxTimeBetweenParticipants,
            minTimeBetweenMessages,
            maxTimeBetweenMessages,
            minTimeTyping,
            maxTimeTyping,
            jobs: {
              createMany: {
                data: Object.values(jobs).flat().map((job) => ({
                  jid: job.jid,
                  queueId: job.queueId
                }))
              }
            }
          },
        });

        return { schedulerId };
      }, {
        body: t.Object({
          chatId: t.String(),
          messages: t.Array(
            t.Union([
              t.Object({
                type: t.Literal("text"),
                text: t.String(),
                file: t.Optional(t.String())
              }),
              t.Object({
                type: t.Literal("media"),
                file: t.String(),
                ppt: t.Optional(t.Boolean())
              }),
            ]),
            { minItems: 1 }
          ),
          instances: t.Array(t.String(), { minItems: 1 }),
          mainInstance: t.String(),
          minTimeBetweenParticipants: t.Number({ minimum: 1 }),
          maxTimeBetweenParticipants: t.Number({ minimum: 1 }),
          minTimeBetweenMessages: t.Number({ minimum: 1 }),
          maxTimeBetweenMessages: t.Number({ minimum: 1 }),
          minTimeTyping: t.Number({ minimum: 1 }),
          maxTimeTyping: t.Number({ minimum: 1 }),
          blockAdms: t.Boolean()
        })
      })
      .post("/:id/stop", async ({ params }) => {
        const schedulerId = params.id;

        const scheduler = await prisma.scheduler.findUnique({
          where: { id: schedulerId },
          include: {
            jobs: true,
            instances: true
          }
        });

        if (!scheduler) {
          return { error: "Scheduler not found" };
        }

        await prisma.scheduler.update({
          where: {
            id: schedulerId
          },
          data: {
            active: false
          }
        });

        for (const instance of scheduler.instances) {
          const queue = new Queue(`zapmax-${instance.instanceId}`, { connection: { url: REDIS_URL } });

          await Promise.all(
            scheduler.jobs
              .map(async job => queue.remove(job.queueId!))
          );
        }

        return { count: scheduler.jobs.length };
      })
      .post("/:id/start", async ({ params, body }) => {
        const schedulerId = params.id;
        const { instances: instancesIds } = body;

        let scheduler = await prisma.scheduler.findUnique({
          where: { id: schedulerId },
          include: {
            jobs: {
              where: {
                sent: false
              }
            },
            instances: true
          }
        });

        if (!scheduler) {
          return { error: "Scheduler not found" };
        }

        if (scheduler.active) {
          return { error: "Scheduler already active" };
        }

        if (instancesIds) {
          await prisma.$transaction([
            prisma.scheduler_Instance.deleteMany({
              where: {
                schedulerId
              }
            }),
            prisma.scheduler_Instance.createMany({
              data: instancesIds.map((instanceId) => ({
                schedulerId,
                instanceId
              }))
            })]);

          scheduler = (await prisma.scheduler.findUnique({
            where: { id: schedulerId },
            include: {
              jobs: {
                where: {
                  sent: false
                }
              },
              instances: true
            }
          }))!;
        }

        const jobsToRun: {
          id: string,
          jid: string
        }[] = [];

        await Promise.all(
          scheduler.jobs
            .filter(job => job.queueId !== null)
            .map(async job => {
              jobsToRun.push({
                id: job.queueId!,
                jid: job.jid,
              });
            })
        )

        const instances = scheduler.instances.map(instance => instance.instanceId);

        let currentTime = Date.now();

        await Promise.all(jobsToRun.map(async (job, i) => {
          const instanceId = instances[i % instances.length];

          const queue = new Queue(`zapmax-${instanceId}`, { connection: { url: REDIS_URL } });

          const delay = Math.floor(
            Math.random() * (
              scheduler.maxTimeBetweenParticipants - scheduler.minTimeBetweenParticipants + 1
            )
          ) + scheduler.minTimeBetweenParticipants;

          currentTime = currentTime + delay * 1000;

          await queue.add("send-messages",
            {
              jid: job.jid,
              schedulerId,
              messages: scheduler.messages,
              minTimeBetweenMessages: scheduler.minTimeBetweenMessages,
              maxTimeBetweenMessages: scheduler.maxTimeBetweenMessages,
              minTimeTyping: scheduler.minTimeTyping,
              maxTimeTyping: scheduler.maxTimeTyping
            },
            {
              delay: currentTime - Date.now(),
              jobId: job.id,
              removeOnComplete: true
            }
          );
        }))

        await prisma.scheduler.update({
          where: {
            id: schedulerId
          },
          data: {
            active: true
          }
        });

        return { count: jobsToRun.length };
      }, {
        body: t.Object({ instances: t.Optional(t.Array(t.String())) })
      })
  )
  .post("/upload", async ({ body }) => {
    const file = body.file;

    const fileStream = Readable.from(file.stream());

    const fileName = `${randomUUIDv7()}.${file.name.split(".").pop()}`;

    await minioClient.putObject(MINIO_BUCKET, fileName, fileStream);

    return { file: fileName };
  }, {
    body: t.Object({
      file: t.File()
    })
  })
  .listen(3000);

export type App = typeof app;

new BullMQWorker(
  "zapmax",
  async (job: Job<{
    instanceId: string
  }>) => {
    const data = job.data;

    if (job.name === "disconnect") {
      instances.delete(data.instanceId);

      let schedulers = await prisma.scheduler.findMany({
        where: {
          instances: {
            some: {
              instanceId: data.instanceId
            }
          }
        },
        include: {
          instances: true,
          jobs: {
            where: {
              sent: false
            }
          }
        }
      });

      await Promise.all(schedulers.map(async (scheduler) => {
        await prisma.scheduler_Instance.deleteMany({
          where: {
            schedulerId: scheduler.id
          }
        });
      }));

      for (const scheduler of schedulers) {
        for (const instance of scheduler.instances) {
          const queue = new Queue(`zapmax-${instance.instanceId}`, { connection: { url: REDIS_URL } });
          await Promise.all(
            scheduler.jobs
              .map(async job => queue.remove(job.queueId!))
          );

          if (scheduler.instances.length === 0) {
            await prisma.scheduler.update({
              where: {
                id: scheduler.id,
              },
              data: {
                active: false
              }
            });
          } else {
            const jobsToRun: {
              id: string,
              jid: string
            }[] = [];

            await Promise.all(
              scheduler.jobs
                .filter(job => job.queueId !== null)
                .map(async job => {
                  jobsToRun.push({
                    id: job.queueId!,
                    jid: job.jid,
                  });
                })
            )

            const instances = scheduler.instances
              .filter(instance => instance.instanceId !== data.instanceId)
              .map(instance => instance.instanceId);

            let currentTime = Date.now();

            await Promise.all(jobsToRun.map(async (job, i) => {
              const instanceId = instances[i % instances.length];

              const queue = new Queue(`zapmax-${instanceId}`, { connection: { url: REDIS_URL } });

              const delay = Math.floor(
                Math.random() * (
                  scheduler.maxTimeBetweenParticipants - scheduler.minTimeBetweenParticipants + 1
                )
              ) + scheduler.minTimeBetweenParticipants;

              const time = currentTime + delay * 1000;
              currentTime = time;

              await queue.add("send-messages", {
                jid: job.jid,
                messages: scheduler.messages,
                minTimeBetweenMessages: scheduler.minTimeBetweenMessages,
                maxTimeBetweenMessages: scheduler.maxTimeBetweenMessages,
                minTimeTyping: scheduler.minTimeTyping,
                maxTimeTyping: scheduler.maxTimeTyping
              },
                {
                  delay: time - Date.now(),
                  jobId: job.id,
                  removeOnComplete: true
                });
            }));
          }
        }
      }
    }
  },
  { connection: { url: REDIS_URL } }
);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
