import { proto, AuthenticationCreds, AuthenticationState, SignalDataTypeMap, initAuthCreds, BufferJSON } from "@whiskeysockets/baileys"
import { PrismaClient } from "@prisma/client"
import { Packr } from "msgpackr";

const packr = new Packr();

const prisma = new PrismaClient()

const fixId = (id: string) => id.replace(/\//g, "__").replace(/:/g, "-");

export const useAuthState = async(instanceId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
	const writeData = async (data: any, id: string) => {
    id = fixId(id);
    data = new Uint8Array(packr.pack(data));
    await prisma.session.upsert({
      where: {
        id_instanceId: {
          id,
          instanceId
        }
      },
      create: {
        id,
        instanceId,
        data
      },
      update: {
        data
      }
    })
	}

	const readData = async (id: string) => {
		const data = await prisma.session.findUnique({
      select: { data: true },
      where: {
        id_instanceId: {
          instanceId,
          id: fixId(id)
        }
      }
    })

    if (data) {
      return packr.unpack(Buffer.from(data.data));
    }

    return null;
	}

	const removeData = async(id: string) => {
		await prisma.session.delete({
      where: {
        id_instanceId: {
          instanceId,
          id: fixId(id)
        }
      }
    })
	}

	const creds: AuthenticationCreds = await readData("creds") || initAuthCreds()

	return {
		state: {
			creds,
			keys: {
				get: async(type, ids) => {
					const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
					await Promise.all(
						ids.map(
							async id => {
								let value = await readData(`${type}-${id}`)
								if (type === "app-state-sync-key" && value) {
									value = proto.Message.AppStateSyncKeyData.fromObject(value)
								}

								data[id] = value
							}
						)
					)

					return data
				},
				set: async(data: { [category: string]: { [id: string]: SignalDataTypeMap[keyof SignalDataTypeMap] } }) => {
					const tasks: Promise<void>[] = []
					for(const category in data) {
						for(const id in data[category]) {
							const value = data[category][id]
							const file = `${category}-${id}`
							tasks.push(value ? writeData(value, file) : removeData(file))
						}
					}

					await Promise.all(tasks)
				}
			}
		},
		saveCreds: () => {
			return writeData(creds, "creds")
		}
	}
}
