import { Boom } from "@hapi/boom"
import NodeCache from "node-cache"
import makeWASocket, { Browsers, delay, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, toNumber } from "@whiskeysockets/baileys"
import P from "pino"
import { parentPort } from "worker_threads";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/esm/node-adapter";
import { useAuthState } from "./auth";
import EventEmitter from "events";
import { PrismaClient } from "@prisma/client";
import { Job, Queue, Worker } from "bullmq";

const REDIS_URL = process.env.REDIS_URL!

const queue = new Queue("zapmax", { connection: { url: REDIS_URL } })

const INSTANCE_ID = process.env.INSTANCE_ID!

const prisma = new PrismaClient()

const logger = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, P.destination("./logs.log"))
logger.level = "trace"

const msgRetryCounterCache = new NodeCache()

type TEvents = Record<string, any> & {
  qr: [qr: string]
  connected: []
  disconnected: []
}

let sock: ReturnType<typeof makeWASocket>
const emitter = new EventEmitter()

export function emit<TEventName extends keyof TEvents & string>(
  eventName: TEventName,
  ...eventArg: TEvents[TEventName]
) {
  emitter.emit(eventName, ...(eventArg as unknown as []))
}

export function on<TEventName extends keyof TEvents & string>(
  eventName: TEventName,
  handler: (...eventArg: TEvents[TEventName]) => void
) {
  emitter.on(eventName, handler as any)
}

export function off<TEventName extends keyof TEvents & string>(
  eventName: TEventName,
  handler: (...eventArg: TEvents[TEventName]) => void
) {
  emitter.off(eventName, handler as any)
}

export function once<TEventName extends keyof TEvents & string>(
  eventName: TEventName,
  handler: (...eventArg: TEvents[TEventName]) => void
) {
  emitter.once(eventName, handler as any)
}

export async function start() {
  const { state, saveCreds } = await useAuthState(INSTANCE_ID)

  const { version } = await fetchLatestBaileysVersion()
  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    msgRetryCounterCache,
    generateHighQualityLinkPreview: true,
    browser: Browsers.macOS("Zapmax"),
    syncFullHistory: true
  })

  sock.ev.process(
    async(events) => {
      if (events["connection.update"]) {
        const update = events["connection.update"]
        const { connection, lastDisconnect, qr } = update

        if (connection === "close") {
          const errorCode = (lastDisconnect?.error as Boom)?.output?.statusCode

          if (errorCode !== DisconnectReason.loggedOut && errorCode !== DisconnectReason.forbidden && errorCode !== 475) {
            start()
          } else {
            emitter.emit("disconnected")
            await prisma.instance.update({ where: { id: INSTANCE_ID }, data: { active: false } })
            queue.add("disconnect", { instanceId: INSTANCE_ID })
            process.exit(0)
          }
        }

        if (qr) {
          emit("qr", qr)
        }

        if (connection === "open") {
          const phone = sock.user?.id.split("@")[0].split(":")[0]
          await prisma.instance.update({ where: { id: INSTANCE_ID }, data: { active: true, phone: phone ? `+${phone}` : null } })
          emit("connected")
        }
      }

      if (events["creds.update"]) {
				await saveCreds()
			}

      if (events["messaging-history.set"]) {
        const { chats, isLatest } = events["messaging-history.set"]
        await prisma.$transaction(async (tx) => {
          if (isLatest) {
            await tx.chat.deleteMany({ where: { instanceId: INSTANCE_ID } });
          }

          const existingIds = (
            await tx.chat.findMany({
              select: { id: true },
              where: { id: { in: chats.map((c) => c.id) }, instanceId: INSTANCE_ID },
            })
          ).map((i) => i.id);

          await tx.chat.createMany({
						data: chats
							.filter((chat) => !existingIds.includes(chat.id) && chat.name)
							.map((chat) => ({ id: chat.id, instanceId: INSTANCE_ID, name: chat.name! })),
					})
        })
      }

      if (events["chats.upsert"]) {
         await prisma.$transaction(
          events["chats.upsert"]
          .filter(chat => chat.name && chat.id)
          .map(chat => prisma.chat.upsert({
            where: { id_instanceId: { id: chat.id, instanceId: INSTANCE_ID } },
            create: { id: chat.id, name: chat.name!, instanceId: INSTANCE_ID },
            update: { name: chat.name! }
          }))
        )
      }

      if (events["chats.update"]) {
        await prisma.$transaction(
          events["chats.update"]
          .filter(chat => chat.name && chat.id)
          .map(chat => prisma.chat.update({
            where: { id_instanceId: { id: chat.id!, instanceId: INSTANCE_ID } },
            data: { name: chat.name!, id: chat.id }
          }))
        )
      }

      if (events["chats.delete"]) {
        await prisma.chat.deleteMany({
          where: { id: { in: events["chats.delete"] }, instanceId: INSTANCE_ID }
        })
      }

      if (events["messages.upsert"]) {
        const { type, messages } = events["messages.upsert"]

        switch (type) {
          case "notify":
            for (const message of messages) {
              const jid = jidNormalizedUser(message.key.remoteJid!)
              const chat = await prisma.chat.findUnique({ where: { id_instanceId: { id: jid, instanceId: INSTANCE_ID } } })

              if (!chat) {
                sock.ev.emit("chats.upsert", [
                  {
                    id: jid,
                    name: message.pushName
                  }
                ])
              }
            }
        }
      }
    }
  )
}

export async function sendMessage(
  jid: string,
  messages: ({ type: "text", text: string } | { type: "media" })[],
  minTimeBetweenMessages = 5000,
  maxTimeBetweenMessages = 10000,
  minTimeTyping = 1000,
  maxTimeTyping = 5000
) {
  await sock.presenceSubscribe(jid)
  await delay(Math.random() * 1000)

  let i = 0;
  for (const message of messages) {
    if (i > 0) {
      await delay(Math.random() * (maxTimeBetweenMessages - minTimeBetweenMessages) + minTimeBetweenMessages)
    }
    await sock.sendPresenceUpdate("composing", jid)
    await delay(Math.random() * (maxTimeTyping - minTimeTyping) + minTimeTyping)
    await sock.sendPresenceUpdate("paused", jid)
    switch (message.type) {
      case "text":
        await sock.sendMessage(jid, { text: message.text })
        break
    }
    i++
  }
}

export async function fetchCommunityParticipants(jid: string) {
  const chats = await sock.groupFetchAllParticipating()

  const chat = chats[jid]

  if (!chat) {
    return []
  }

  return chat.participants
}

export async function terminate() {
  process.exit(0)
}

const methods = {
  on,
  off,
  emit,
  once,
  start,
  sendMessage,
  fetchCommunityParticipants,
  terminate
}

type Whatsapp = typeof methods

export default Whatsapp

Comlink.expose(methods, nodeEndpoint(parentPort!));

new Worker(
  `zapmax-${INSTANCE_ID}`,
  async (job: Job<{
    jid: string,
    messages: any[],
    schedulerId: string,
    minTimeBetweenMessages: number,
    maxTimeBetweenMessages: number,
    minTimeTyping: number,
    maxTimeTyping: number
  }>) => {
    if (job.name === "send-messages") {
      const {
        jid,
        messages,
        schedulerId,
        minTimeBetweenMessages,
        maxTimeBetweenMessages,
        minTimeTyping,
        maxTimeTyping
      } = job.data

      await sendMessage(
        jid,
        messages,
        minTimeBetweenMessages,
        maxTimeBetweenMessages,
        minTimeTyping,
        maxTimeTyping
      )
      await prisma.job.update({
        where: { jid_schedulerId: { jid, schedulerId } },
        data: { sent: true }
      })
    }
  },
  { connection: { url: REDIS_URL } }
)
