import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import httpClient from "@/lib/httpClient";
import { useMutation, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "wouter-preact";
import * as v from "valibot";
import { useForm } from "react-hook-form";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { MultiSelect } from "@/components/ui/multi-select";

const schema = v.object({
  instances: v.array(v.string()),
})

type FormData = NonNullable<v.InferInput<typeof schema>>

export default function Schedule() {
  const params = useParams()
  const scheduleId = params.id as string

  const [{ data: { data: schedule } }, { data: { data: instances } }] = useSuspenseQueries({
    queries: [{
      queryKey: ["schedule", scheduleId],
      queryFn: () => httpClient.api.schedulers({ id: scheduleId }).get(),
      refetchInterval: 5000
    }, {
      queryKey: ["instances"],
      queryFn: () => httpClient.api.instances.index.get(),
      refetchInterval: 5000
    }]
  })

  const form = useForm<FormData>({
    resolver: valibotResolver(schema),
    mode: "onBlur",
    defaultValues: {
      instances: schedule?.instances.map(({ Instance }) => Instance!.id) || []
    }
  })

  const { mutateAsync: stop } = useMutation({
    mutationFn: () => httpClient.api.schedulers({ id: scheduleId }).stop.post(),
  })

  const { mutateAsync: start } = useMutation({
    mutationFn: (data: FormData) => httpClient.api.schedulers({ id: scheduleId }).start.post({
      instances: data.instances
    }),
  })

  const queryClient = useQueryClient()

  const stopSchedule = async () => {
    toast.promise(async () => {
      await stop()
      await queryClient.invalidateQueries({ queryKey: ["schedule", scheduleId] })
    }, {
      loading: "Parando agendamento",
      success: "Agendamento parado com sucesso!",
      error: "Ocorreu um erro ao parar o agendamento!"
    })
  }

  const startSchedule = async (data: FormData) => {
    toast.promise(async () => {
      await start(data)
      await queryClient.invalidateQueries({ queryKey: ["schedule", scheduleId] })
    }, {
      loading: "Iniciando agendamento",
      success: "Agendamento iniciado com sucesso!",
      error: "Ocorreu um erro ao iniciar o agendamento!"
    })
  }

  if (!schedule || !instances) return null

  const totalJobs = schedule.jobs.length
  const totalSentJobs = schedule.jobs.filter(job => job.sent).length

  return (
    <>
      <h1 class="text-2xl font-semibold tracking-tight">Agendamento</h1>
      {!schedule.active && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Este agendamento está pausado</AlertTitle>
          <AlertDescription>Isso pode ter ocorrido devido a uma pausa manual, ou a todas as intâncias associades terem sido desconectadas</AlertDescription>
        </Alert>
      )}
      <div class="mt-4">
        <span class="text-sm font-semibold">Status</span>
        <span class="text-sm ml-2">
          {totalSentJobs} de {totalJobs} envios concluídos
        </span>
        <Progress value={(totalSentJobs / totalJobs) * 100} />
      </div>
      {schedule.active ? (
        <Button onClick={stopSchedule}>Pausar</Button>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(startSchedule)} class="space-y-4">
            <FormField
              control={form.control}
              name="instances"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instâncias para envio</FormLabel>
                  <FormControl>
                    <MultiSelect
                      options={instances.map(({ id, phone }) => ({ label: phone || id, value: id }))}
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Continuar</Button>
          </form>
        </Form>
      )}
    </>
  )
}
