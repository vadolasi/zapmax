import { Button } from "@/components/ui/button"
import { Eye } from "lucide-react"
import httpClient from "@/lib/httpClient"
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "wouter-preact"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const columns: ColumnDef<{
  id: string
  active: boolean
}>[] = [
    {
      accessorKey: "id",
      header: "ID"
    },
    {
      accessorKey: "active",
      header: "Ativo",
      cell: ({ row }) => (
        <span>{row.original.active ? "Sim" : "Não"}</span>
      )
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
          <Link to={`~/schedules/${row.original.id}`}>
            <Eye />
          </Link>
        </Button>
      )
    }
  ]

export default function Schedules() {
  const [{ data: { data } }] = useSuspenseQueries({
    queries: [{
      queryKey: ["schedules"],
      queryFn: () => httpClient.api.schedulers.index.get(),
      refetchInterval: 5000
    }]
  })

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (!data) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h1 class="text-2xl font-semibold tracking-tight text-center">Agendamentos</h1>
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
                  Nenhum agendamento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Button asChild>
        <Link href="~/schedules/create">Criar agendamento</Link>
      </Button>
    </div>
  )
}
