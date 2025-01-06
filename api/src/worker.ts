import { Boom } from "@hapi/boom"
import NodeCache from "node-cache"
import makeWASocket, { ButtonReplyInfo, AnyMessageContent, Browsers, delay, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, proto } from "@whiskeysockets/baileys"
import P from "pino"
import { parentPort } from "worker_threads";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/esm/node-adapter";
import { useAuthState } from "./auth";
import EventEmitter from "events";
import { PrismaClient } from "@prisma/client";

const INSTANCE_ID = process.env.INSTANCE_ID!

const prisma = new PrismaClient()

const logger = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, P.destination("./wa-logs.txt"))
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
    browser: Browsers.macOS("Desktop"),
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
							.filter((c) => !existingIds.includes(c.id) && c.name)
							.map((c) => ({ id: c.id, instanceId: INSTANCE_ID, name: c.name! })),
					})
        })
      }

      if (events["chats.upsert"]) {
         await prisma.$transaction(
          events["chats.upsert"]
          .filter(chat => chat.name && chat.id)
          .map(chat => prisma.chat.update({
            where: { id_instanceId: { id: chat.id, instanceId: INSTANCE_ID } },
            data: { name: chat.name!, id: chat.id }
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
    }
  )
}

export async function sendMessage(jid: string, messages: AnyMessageContent[]) {
  await sock.presenceSubscribe(jid)

  for (const message of messages) {
    await delay(Math.random() * 1000)
    await sock.sendPresenceUpdate("composing", jid)
    await delay(Math.random() * 5000)
    await sock.sendPresenceUpdate("paused", jid)
    sock.sendMessage(jid, message)
  }
}

export async function massiveSendToCommunity(jid: string, messages: AnyMessageContent[]) {
  const chats = await sock.groupFetchAllParticipating()

  const chat = chats[jid]

  if (!chat) {
    return
  }

  const firstParticipant = chat.participants[0]

  await sendMessage(firstParticipant.id, messages)

  for (const participant of chat.participants.slice(1)) {
    await delay(Math.random() * 10000 + 20000)
    await sendMessage(participant.id, messages)
  }
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
  massiveSendToCommunity,
  terminate
}

type Whatsapp = typeof methods

export default Whatsapp

Comlink.expose(methods, nodeEndpoint(parentPort!));
