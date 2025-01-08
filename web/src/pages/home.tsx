import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Instances from "@/components/instances"
import Schedules from "@/components/schedules"

export default function Home() {
  return (
    <>
      <Tabs defaultValue="instances" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-10">
          <TabsTrigger value="instances">Instancias</TabsTrigger>
          <TabsTrigger value="schedues">Envios</TabsTrigger>
        </TabsList>
        <TabsContent value="instances" className="space-y-6">
          <Instances />
        </TabsContent>
        <TabsContent value="schedues" className="space-y-6">
          <Schedules />
        </TabsContent>
      </Tabs>
    </>
  )
}
