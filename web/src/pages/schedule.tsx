import { Progress } from "@/components/ui/progress";
import httpClient from "@/lib/httpClient";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "wouter-preact";

export default function Schedule() {
  const params = useParams()
  const scheduleId = params.id as string

  const { data: { data: schedule } } = useSuspenseQuery({
    queryKey: ["schedule", scheduleId],
    queryFn: () => httpClient.api.schedulers({ id: scheduleId }).get(),
    refetchInterval: 5000
  })

  if (!schedule) return null

  const totalJobs = schedule.jobs.length
  const totalSentJobs = schedule.jobs.filter(job => job.sent).length

  return (
    <>
      <h1 class="text-2xl font-semibold tracking-tight">Agendamento</h1>
      <div class="mt-4">
        <span class="text-sm font-semibold">Status</span>
        <span class="text-sm ml-2">
          {totalSentJobs} de {totalJobs} envios concluídos
        </span>
        <Progress value={(totalSentJobs / totalJobs) * 100} />
      </div>
    </>
  )
}
