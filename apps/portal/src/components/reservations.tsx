import { useDeferredValue, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PlusIcon, SearchIcon, ArrowUpRightIcon } from "lucide-react"
import {
  RoomBookingDialog,
  type BookingTarget,
} from "@/components/room-booking-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { ChoiceField, TextField } from "@/components/workflow-fields"
import { searchReservations } from "@/lib/api"
import { formatMoney } from "@/lib/money"
const statuses = [
  { value: "all", label: "Todos los estados" },
  { value: "confirmed", label: "Confirmadas" },
  { value: "checked_in", label: "En estancia" },
  { value: "checked_out", label: "Salida registrada" },
  { value: "no_show", label: "No se presentó" },
  { value: "cancelled", label: "Canceladas" },
]
export function Reservations({
  onOpenReservation,
}: {
  onOpenReservation: (id: string) => void
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(0),
    [target, setTarget] = useState<BookingTarget | null>(null)
  const q = useDeferredValue(search)
  const query = useQuery({
    queryKey: ["reservations", "search", q, status, page],
    queryFn: () =>
      searchReservations(q, status === "all" ? "" : status, page * 50),
  })
  const rows = query.data ?? []
  function open(id: string) {
    setTarget(null)
    onOpenReservation(id)
  }
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 overflow-y-auto p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Recepción
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Reservas y estancias
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gestiona cada habitación y mantén una sola cuenta por reserva.
          </p>
        </div>
        <Button onClick={() => setTarget({ mode: "new" })}>
          <PlusIcon data-icon="inline-start" />
          Nueva reserva
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Reservas visibles", String(rows.length), "En esta página"],
          [
            "Habitaciones en estancia",
            String(
              rows
                .flatMap((r) => r.rooms)
                .filter((l) => l.status === "checked_in").length
            ),
            "Llegada registrada",
          ],
          [
            "Saldo pendiente",
            formatMoney(
              rows.reduce((s, r) => s + Math.max(0, r.balanceCents), 0)
            ),
            "De las reservas visibles",
          ],
        ].map(([title, value, description]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <FieldGroup className="grid gap-3 sm:grid-cols-[1fr_240px]">
        <TextField
          label="Buscar por huésped o código"
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(0)
          }}
        />
        <ChoiceField
          label="Estado de habitación"
          value={status}
          options={statuses}
          onChange={(v) => {
            setStatus(v)
            setPage(0)
          }}
        />
      </FieldGroup>
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.error ? (
        <>
          <FieldError>{query.error.message}</FieldError>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </>
      ) : rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <SearchIcon />
            <EmptyTitle>No se encontraron reservas</EmptyTitle>
            <EmptyDescription>
              Cambia la búsqueda o crea una nueva reserva.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col divide-y border">
          {rows.map((r) => (
            <article
              key={r.id}
              className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
            >
              <div>
                <button
                  className="text-left font-semibold underline-offset-4 hover:underline"
                  onClick={() => open(r.id)}
                >
                  {r.guestName}
                </button>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.code} · {r.rooms.length}{" "}
                  {r.rooms.length === 1 ? "habitación" : "habitaciones"}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <p>
                  {r.checkIn} al {r.checkOut}
                </p>
                <div className="flex flex-wrap gap-1">
                  {[...new Set(r.rooms.map((l) => l.status))].map((s) => (
                    <Badge key={s} variant="secondary">
                      {statuses.find((o) => o.value === s)?.label ?? s}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-right">
                  <p className="font-medium tabular-nums">
                    {formatMoney(Math.abs(r.balanceCents))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.balanceCents < 0
                      ? "Saldo a favor"
                      : r.balanceCents > 0
                        ? "Pendiente"
                        : "Saldado"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Abrir reserva de ${r.guestName}`}
                  onClick={() => open(r.id)}
                >
                  <ArrowUpRightIcon />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={page === 0 || query.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          disabled={rows.length < 50 || query.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </div>
      <RoomBookingDialog
        target={target}
        timeZone="UTC"
        onClose={() => setTarget(null)}
        onViewReservation={open}
      />
    </main>
  )
}
