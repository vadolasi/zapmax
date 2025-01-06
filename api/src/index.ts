import { Elysia, t } from "elysia";
import { randomUUIDv7 } from "bun";
import type Whatsapp from "./worker";
import { Worker } from "worker_threads";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/esm/node-adapter";
import { PrismaClient } from "@prisma/client";
import { logger } from "@grotto/logysia";

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
      .post("/:id/send", async (req) => {
        const instanceId = req.params.id;
        const { chatId, messages } = req.body;

        const whatsapp = instances.get(instanceId)!;

        if (!whatsapp) {
          return { error: "Instance not found" };
        }

        await whatsapp.massiveSendToCommunity(chatId, messages.map((message) => ({ text: message })));

        return { chatId, messages };
      }, {
        body: t.Object({ chatId: t.String(), messages: t.Array(t.String()) })
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
  .listen(3000);

export type App = typeof app;

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
