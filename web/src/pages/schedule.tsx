import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import httpClient from "@/lib/httpClient";
import { useMutation, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter-preact";
import * as v from "valibot";
import { useForm } from "react-hook-form";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { MultiSelect } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";

const schema = v.object({
  instances: v.array(v.string()),
  minTimeBetweenParticipants: v.pipe(v.number(), v.minValue(1)),
  maxTimeBetweenParticipants: v.pipe(v.number(), v.minValue(1)),
  groupSize: v.pipe(v.number(), v.minValue(1)),
  groupDelay: v.pipe(v.number(), v.minValue(1)),
  minTimeTyping: v.pipe(v.number(), v.minValue(1)),
  maxTimeTyping: v.pipe(v.number(), v.minValue(1)),
})

type FormData = NonNullable<v.InferInput<typeof schema>>

export default function Schedule() {
  const params = useParams()
  const [, navigate] = useLocation()
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
      instances: schedule?.instances.map(({ Instance }) => Instance!.id) || [],
      minTimeBetweenParticipants: schedule?.minTimeBetweenParticipants || 20,
      maxTimeBetweenParticipants: schedule?.maxTimeBetweenParticipants || 40,
      groupSize: schedule?.groupSize || 10,
      groupDelay: schedule?.groupDelay || 60,
      minTimeTyping: schedule?.minTimeTyping || 1,
      maxTimeTyping: schedule?.maxTimeTyping || 3,
    }
  })

  const { mutateAsync: stop } = useMutation({
    mutationFn: () => httpClient.api.schedulers({ id: scheduleId }).stop.post(),
  })

  const { mutateAsync: start } = useMutation({
    mutationFn: (data: FormData) => httpClient.api.schedulers({ id: scheduleId }).start.post({
      ...data,
      instances: data.instances,
    }),
  })

  const { mutateAsync: destroy } = useMutation({
    mutationFn: () => httpClient.api.schedulers({ id: scheduleId }).delete(),
  })

  const deleteSchedule = async () => {
    toast.promise(async () => {
      await destroy()
      navigate("/schedules")
    }, {
      loading: "Excluindo agendamento",
      success: "Agendamento excluído com sucesso!",
      error: "Ocorreu um erro ao excluir o agendamento!"
    })
  }

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
        <>
          <span class="text-sm font-semibold">Instâncias: {schedule.instances.map(({ Instance }) => Instance?.phone ?? Instance?.id).join(", ")}</span>
          <Button onClick={stopSchedule}>Pausar</Button>
        </>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              <FormField
                control={form.control}
                name="minTimeBetweenParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delay mínimo entre cada número (s)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(event: { target: { value: string | number } }) => field.onChange(+event.target.value)}
                        type="number"
                        min="1"
                        step="1"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxTimeBetweenParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delay máximo entre cada número (s)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(event: { target: { value: string | number } }) => field.onChange(+event.target.value)}
                        type="number"
                        min="1"
                        step="1"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              <FormField
                control={form.control}
                name="groupSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tamanho do grupo</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(event: { target: { value: string | number } }) => field.onChange(+event.target.value)}
                        type="number"
                        min="1"
                        step="1"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="groupDelay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delay entre grupos (s)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(event: { target: { value: string | number } }) => field.onChange(+event.target.value)}
                        type="number"
                        min="1"
                        step="1"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              <FormField
                control={form.control}
                name="minTimeTyping"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tempo mínimo de digitação por caracterer (ms)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(event: { target: { value: string | number } }) => field.onChange(+event.target.value)}
                        type="number"
                        min="1"
                        step="1"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxTimeTyping"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tempo máximo de digitação por caracterer (ms)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(event: { target: { value: string | number } }) => field.onChange(+event.target.value)}
                        type="number"
                        min="1"
                        step="1"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit">Continuar</Button>
          </form>
        </Form>
      )}
      <Button onClick={deleteSchedule} variant="destructive">Excluir agendamento</Button>
    </>
  )
}
