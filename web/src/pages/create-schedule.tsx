import httpClient from "@/lib/httpClient"
import { useMutation, useSuspenseQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown, Minus, Plus } from "lucide-react"
import * as v from "valibot"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useFieldArray, useForm } from "react-hook-form"
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
import { cn } from "@/lib/utils"

const schema = v.object({
  mainInstance: v.string(),
  chatId: v.string(),
  instances: v.array(v.string()),
  blockAdms: v.boolean(),
  minTimeBetweenParticipants: v.pipe(v.number(), v.minValue(1)),
  maxTimeBetweenParticipants: v.pipe(v.number(), v.minValue(1)),
  minTimeBetweenMessages: v.pipe(v.number(), v.minValue(1)),
  maxTimeBetweenMessages: v.pipe(v.number(), v.minValue(1)),
  minTimeTyping: v.pipe(v.number(), v.minValue(1)),
  maxTimeTyping: v.pipe(v.number(), v.minValue(1)),
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
          mediaUrl: v.optional(v.string()),
          mediaMime: v.optional(v.string())
        }),
        v.object({
          type: v.literal("media"),
          url: v.pipe(
            v.string(),
            v.trim(),
            v.nonEmpty("Este campo é obrigatório")
          ),
          mime: v.pipe(
            v.string(),
            v.trim(),
            v.nonEmpty("Este campo é obrigatório")
          ),
          ppt: v.optional(v.boolean())
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
    mutationFn: (data: FormData) =>
      httpClient.api.schedulers.index.post(data)
  })

  const form = useForm<FormData>({
    resolver: valibotResolver(schema),
    mode: "onBlur",
    defaultValues: {
      mainInstance: instances?.[0]?.id,
      instances: [],
      blockAdms: true,
      minTimeBetweenParticipants: 20,
      maxTimeBetweenParticipants: 40,
      minTimeBetweenMessages: 5,
      maxTimeBetweenMessages: 10,
      minTimeTyping: 1,
      maxTimeTyping: 3,
      messages: []
    }
  })

  const instanceId = form.watch("mainInstance")

  const { data: { data: chats } } = useSuspenseQuery({
    queryKey: ["chats", instanceId],
    queryFn: () => httpClient.api.instances({ id: instanceId }).chats.get(),
  })

  const messages = useFieldArray({
    control: form.control,
    // @ts-ignore
    name: "messages"
  })

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
            name="chatId"
            render={({ field }) => (
              <FormItem>
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
          <FormField
            control={form.control}
            name="chatId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chat para extração</FormLabel>
                <br />
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-[200px] justify-between",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value
                          ? chats.find(
                            (chat) => chat.id === field.value
                          )?.name
                          : "Selecione um chat"}
                        <ChevronsUpDown className="opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Pesquisar"
                        className="h-9"
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum chat encontrado</CommandEmpty>
                        <CommandGroup>
                          {chats.map((chat) => (
                            <CommandItem
                              value={chat.name}
                              key={chat.id}
                              onSelect={() => {
                                form.setValue("chatId", chat.id)
                              }}
                            >
                              {chat.name}
                              <Check
                                className={cn(
                                  "ml-auto",
                                  chat.id === field.value
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="instances"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instâncias para envio</FormLabel>
                <FormControl>
                  <MultiSelect
                    options={instances.map(instance => ({ label: instance.phone || instance.id, value: instance.id }))}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
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
              <FormItem>
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel>Não enviar para administradores</FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-6 w-full">
            <FormField
              control={form.control}
              name="minTimeBetweenParticipants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay mínimo entre cada envio</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
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
                  <FormLabel>Delay máximo entre cada envio</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-6 w-full">
            <FormField
              control={form.control}
              name="minTimeBetweenMessages"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay mínimo entre mensagens</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxTimeBetweenMessages"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay máximo entre mensagens</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-6 w-full">
            <FormField
              control={form.control}
              name="minTimeTyping"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tempo mínimo de digitação</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
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
                  <FormLabel>Tempo máximo de digitação</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
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
            <div className="flex items-center justify-center space-x-2 w-full" key={message.id}>
              <FormField
                key={message.id}
                control={form.control}
                name={`messages.${index}.text`}
                render={({ field }) => (
                  <FormItem className="flex flex-col w-full">
                    <FormLabel>Mensagem {index + 1}</FormLabel>
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
              <Button
                onClick={() => {
                  messages.remove(index)
                }}
                size="icon"
                type="button"
              >
                <Minus />
              </Button>
            </div>
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
          <Button type="submit">Enviar</Button>
        </form>
      </Form>
    </>
  )
}
