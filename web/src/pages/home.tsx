import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Instances from "@/components/instances"
import Schedules from "@/components/schedules"
import { useLocation, useSearch, Redirect } from "wouter-preact"
import { Suspense } from "preact/compat"
import { LoaderCircle } from "lucide-react"

export default function Home() {
  const [, navigate] = useLocation()
  const query = new URLSearchParams(useSearch())
  const tab = query.get("tab")

  if (!tab) {
    return <Redirect to="/?tab=instances" />
  }

  return (
    <>
      <Tabs defaultValue={tab} className="w-full" onValueChange={(value: string) => navigate(`/?tab=${value}`)}>
        <TabsList className="grid w-full grid-cols-2 mb-10">
          <TabsTrigger value="instances">Instancias</TabsTrigger>
          <TabsTrigger value="schedues">Envios</TabsTrigger>
        </TabsList>
        <Suspense fallback={
          <div class="w-full h-full flex items-center justify-center">
            <LoaderCircle size={64} className="animate-spin" />
          </div>
        }>
          <TabsContent value="instances" className="space-y-6">
            <Instances />
          </TabsContent>
          <TabsContent value="schedues" className="space-y-6">
            <Schedules />
          </TabsContent>
        </Suspense>
      </Tabs>
    </>
  )
}
