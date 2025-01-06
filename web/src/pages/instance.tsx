import httpClient from "@/lib/httpClient"
import { useMutation, useSuspenseQuery } from "@tanstack/react-query"
import { useParams } from "wouter-preact"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { Check, ChevronsUpDown, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import * as v from "valibot"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useFieldArray, useForm } from "react-hook-form"
import { valibotResolver } from "@hookform/resolvers/valibot"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"

const schema = v.object({
  chatId: v.pipe(v.string(), v.nonEmpty("Este campo é obrigatório")),
  messages: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.nonEmpty("Este campo é obrigatório"))), v.minLength(1, "Adicione pelo menos uma mensagem"))
})

type FormData = NonNullable<v.InferInput<typeof schema>>

export default function Instance() {
  const params = useParams()
  const instanceId = params.id as string

  const { data: { data: chats } } = useSuspenseQuery({
    queryKey: ["instances", instanceId],
    queryFn: () => httpClient.api.instances({ id: instanceId }).chats.get(),
    refetchInterval: 5000
  })

  const { mutateAsync: send } = useMutation({
    mutationFn: (data: FormData) => httpClient.api.instances({ id: instanceId }).send.post(data)
  })

  const form = useForm<FormData>({
    resolver: valibotResolver(schema),
    mode: "onBlur",
    defaultValues: {
      chatId: "",
      messages: [""]
    }
  })

  form.watch("chatId")

  const messages = useFieldArray({
    control: form.control,
    // @ts-ignore
    name: "messages"
  })

  const onSubmit = (data: FormData) => {
    toast.promise(async () => {
      await send(data)
      form.reset()
    }, {
      loading: "Programando envios",
      success: "Envios programados com sucesso",
      error: "Ocorreu um erro ao programar os envios!"
    })
  }

  if (!chats) {
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
              <FormItem className="flex flex-col w-full">
                <FormLabel>Chat</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                      >
                        {field.value
                          ? chats.find((chat) => chat.id === field.value)?.name
                          : "Selecione o chat"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Pesquisar..." />
                      <CommandList>
                        <CommandEmpty>Nenhum chat encontrado</CommandEmpty>
                        <CommandGroup>
                          {chats.map((chat) => (
                            <CommandItem
                              key={chat.id}
                              value={chat.name}
                              onSelect={() => {
                                form.setValue("chatId", chat.id)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  field.value === chat.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {chat.name}
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
          {messages.fields.map((message, index) => (
            <div className="flex items-center justify-center space-x-2 w-full" key={message.id}>
              <FormField
                key={message.id}
                control={form.control}
                name={`messages.${index}`}
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
              messages.append("")
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
