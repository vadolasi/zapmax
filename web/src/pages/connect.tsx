import httpClient from "@/lib/httpClient"
import { LoaderCircle } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { QRCodeCanvas } from "qrcode.react"
import { useLocation, useParams } from "wouter-preact"

export default function ConnectToInstance() {
  const params = useParams()
  const [, setLocation] = useLocation()
  const instanceId = params.id as string
  const [qrCode, setQrCode] = useState<string | null>(null)

  useEffect(() => {
    const subscription = httpClient.api.instances({ id: instanceId }).subscribe()
    subscription.on("message", (message) => {
      const event = message.data as { type: "qr"; qr: string } | { type: "connected" }

      if (event.type === "qr") {
        setQrCode(event.qr)
      } else {
        setLocation("~/")
      }
    })
    return () => {
      subscription.close()
    }
  }, [])

  return (
    <>
      <h1 class="text-2xl font-semibold tracking-tight">Escaneie o código abaixo no aplicativo do Whatsapp</h1>
      {qrCode ? (
        <QRCodeCanvas value={qrCode} level="L" size={320} />
      ) : (
        <LoaderCircle className="animate-spin" size={64} />
      )}
    </>
  )
}
