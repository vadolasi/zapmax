import httpClient from "@/lib/httpClient"
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Plus, Trash } from "lucide-react"
import * as v from "valibot"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Control, useFieldArray, useForm, useFormContext, useFormState } from "react-hook-form"
import { valibotResolver } from "@hookform/resolvers/valibot"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { MultiSelect } from "@/components/ui/multi-select"
import { useLocation } from "wouter-preact"
import { Input } from "@/components/ui/input"
import { VirtualizedCombobox } from "@/components/ui/virtualized-combobox"
import { useEffect } from "preact/hooks"

const schema = v.object({
  mainInstance: v.pipe(v.string(), v.nonEmpty("Este campo é obrigatório")),
  chatId: v.pipe(v.string(), v.nonEmpty("Este campo é obrigatório")),
  instances: v.pipe(v.array(v.string()), v.minLength(1, "Adicione pelo menos uma instância")),
  blockAdms: v.boolean(),
  minTimeBetweenParticipants: v.pipe(v.number(), v.minValue(1)),
  maxTimeBetweenParticipants: v.pipe(v.number(), v.minValue(1)),
  groupSize: v.pipe(v.number(), v.minValue(1)),
  groupDelay: v.pipe(v.number(), v.minValue(1)),
  minTimeTyping: v.pipe(v.number(), v.minValue(0)),
  maxTimeTyping: v.pipe(v.number(), v.minValue(0)),
  messages: v.pipe(
    v.array(
      v.union([
        v.object({
          type: v.literal("text"),
          text: v.pipe(
            v.string(),
            v.trim(),
            v.nonEmpty("Este campo é obrigatório")
          ),
          file: v.optional(v.string()),
        }),
        v.object({
          type: v.literal("media"),
          file: v.string(),
          ppt: v.boolean()
        })
      ])
    ),
    v.minLength(1, "Adicione pelo menos uma mensagem")
  )
})

type FormData = NonNullable<v.InferInput<typeof schema>>

export default function CreateSchedule() {
  const [, setLocation] = useLocation()
  const { data: { data: instances } } = useSuspenseQuery({
    queryKey: ["instances"],
    queryFn: () => httpClient.api.instances.index.get(),
  })

  const { mutateAsync: send } = useMutation({
    mutationFn: (data: FormData) => httpClient.api.schedulers.index.post(data)
  })

  const form = useForm<FormData>({
    resolver: valibotResolver(schema),
    mode: "onBlur",
    defaultValues: {
      mainInstance: instances?.[0]?.id,
      chatId: "",
      instances: [],
      blockAdms: true,
      minTimeBetweenParticipants: 20,
      maxTimeBetweenParticipants: 40,
      minTimeTyping: 1,
      maxTimeTyping: 3,
      messages: [{ type: "text", text: "" }]
    }
  })

  const instanceId = form.watch("mainInstance")

  const { data: chats } = useQuery({
    queryKey: ["chats", instanceId],
    queryFn: () => httpClient.api.instances({ id: instanceId }).chats.get(),
    enabled: !!instanceId
  })

  const messages = useFieldArray({
    control: form.control,
    // @ts-ignore
    name: "messages"
  })

  const massageValues = form.watch("messages")

  const onSubmit = (data: FormData) => {
    toast.promise(async () => {
      const { data: schedule } = await send(data)
      setLocation(`~/schedules/${schedule!.schedulerId}`)
    }, {
      loading: "Programando envios",
      success: "Envios programados com sucesso",
      error: "Ocorreu um erro ao programar os envios!"
    })
  }

  if (!instances || !chats) {
    return (
      <div class="w-full min-h-screen flex items-center justify-center">
        Erro
      </div>
    )
  }

  return (
    <>
      <h1 class="text-2xl font-semibold tracking-tight text-center">Enviar mensagens</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-full flex flex-col items-center">
          <FormField
            control={form.control}
            name="mainInstance"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Instância para extração</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma instancia" />
                    </SelectTrigger>
                    <SelectContent>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.phone || instance.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {chats === undefined ? (
            <div className="w-full">Carregando chats...</div>
          ) : (
            <FormField
              control={form.control}
              name="chatId"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Chat para extração</FormLabel>
                  <br />
                  <FormControl>
                    <VirtualizedCombobox
                      width="100%"
                      options={chats.data?.map(chat => ({ value: chat.id, label: chat.name })) || []}
                      value={field.value}
                      onSelect={field.onChange}
                      searchPlaceholder="Buscar chats..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="instances"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Instâncias para envio</FormLabel>
                <FormControl>
                  <MultiSelect
                    options={instances.map(instance => ({ label: instance.phone || instance.id, value: instance.id }))}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    placeholder="Selecione as instâncias"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="blockAdms"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 shadow w-full">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Não enviar para administradores</FormLabel>
                  <FormMessage />
                </div>
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
          <FormLabel>Mensagens</FormLabel>
          {messages.fields.map((message, index) => (
            <MessageInput
              key={message.id}
              control={form.control}
              index={index}
              values={massageValues}
              onDeleted={() => messages.remove(index)}
            />
          ))}
          <Button
            onClick={() => {
              messages.append({ type: "text", text: "" })
            }}
            size="icon"
            className="self-end"
            type="button"
          >
            <Plus />
          </Button>
          <Button type="submit" disabled={!form.formState.isValid}>Enviar</Button>
        </form>
      </Form>
    </>
  )
}

function MessageInput({
  control,
  index,
  values,
  onDeleted
}: {
  control: Control<FormData>,
  index: number,
  values: FormData["messages"],
  onDeleted: () => void
}) {
  const value = values[index]

  const { setValue } = useFormContext()

  useEffect(() => {
    if (value.type === "media") {
      setValue(`messages.${index}`, { type: "media", file: "", ppt: false })
    } else {
      setValue(`messages.${index}`, { type: "text", text: "" })
    }
  }, [value.type])

  const { mutateAsync: uploadFile } = useMutation({
    mutationFn: (file: File) => httpClient.api.upload.post({ file })
  })

  return (
    <>
      <div className="flex items-center justify-center space-x-2 w-full">
        <div class="w-full space-y-4">
          <FormField
            control={control}
            name={`messages.${index}.type`}
            render={({ field }) => (
              <FormItem className="flex flex-col w-full">
                <FormControl>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de mensagem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto (opcionalmente atrelado a um arquivo)</SelectItem>
                      <SelectItem value="media">Apenas mídia</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`messages.${index}.file`}
            render={({ field }) => (
              <FormItem className="flex flex-col w-full">
                <FormControl>
                  <Input
                    type="file"
                    {...field}
                    onChange={async (event: { target: { files: FileList | null } }) => {
                      if (!event.target.files) return
                      const file = event.target.files[0]
                      const { data } = await uploadFile(file)
                      if (data) {
                        field.onChange(data.file)
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {value.type === "media" && (
            <FormField
              control={control}
              name={`messages.${index}.ppt`}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 shadow w-full">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Enviar como audio gravado na hora</FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
          )}
          {value.type === "text" && (
            <FormField
              control={control}
              name={`messages.${index}.text`}
              render={({ field }) => (
                <FormItem className="flex flex-col w-full">
                  <FormControl>
                    <Textarea
                      {...field}
                      className="w-full"
                      placeholder="Digite a mensagem"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <Button
          onClick={onDeleted}
          size="icon"
          type="button"
        >
          <Trash />
        </Button>
      </div>
    </>
  )
}
