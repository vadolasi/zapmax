import { Button } from "@/components/ui/button"
import httpClient from "@/lib/httpClient"
import { useMutation, useSuspenseQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Link, useLocation } from "wouter-preact"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Eye } from "lucide-react"

export const columns: ColumnDef<{
  id: string
  phone: string | null
}>[] = [
  {
    accessorKey: "id",
    header: "ID"
  },
  {
    accessorKey: "phone",
    header: "Número"
  },
  {
    accessorKey: "actions",
    header: "Ações",
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon"
        asChild
      >
        <Link to={`/${row.original.id}`}>
          <Eye />
        </Link>
      </Button>
    )
  }
]

export default function Home() {
  const [, setLocation] = useLocation()

  const { data: { data } } = useSuspenseQuery({
    queryKey: ["instances"],
    queryFn: () => httpClient.api.instances.index.get(),
    refetchInterval: 5000
  })

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const { mutateAsync: createInstanceMutation } = useMutation({
    mutationFn: () => httpClient.api.instances.index.post(),
    onSuccess: ({ data }) => {
      setLocation(`/${data?.instanceId}/connect`)
    }
  })

  const createInstance = async () => {
    toast.promise(createInstanceMutation(), {
      loading: "Criando instância",
      success: "Instância criada com sucesso!",
      error: "Ocorreu um erro ao criar a instância!"
    })
  }

  if (!data) {
    return <div>Loading...</div>
  }

  return (
    <>
      <h1 class="text-2xl font-semibold tracking-tight text-center">Instâncias em execução</h1>
      <div className="rounded-md border w-full">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Button onClick={createInstance}>Criar instância</Button>
    </>
  )
}
