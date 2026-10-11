import { useId } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { bookingRoomCharges, bookingSummary } from "@/lib/booking-prices"
import { formatMoney } from "@/lib/money"

export type BookingSummaryRoom = {
  key: string
  typeName: string
  adults: number | null
  children: number | null
  status: string | null
  charges: ReturnType<typeof bookingRoomCharges>
  invalid: boolean
  stayLabel?: string
}

export function BookingSummary({
  rooms,
  summary,
  paidCents,
  currency,
  stayLabel,
  showPayments,
  message,
  waiverCents = 0,
  refundCents = 0,
}: {
  rooms: BookingSummaryRoom[]
  summary: ReturnType<typeof bookingSummary>
  paidCents: number
  currency: string
  stayLabel: string | null
  showPayments: boolean
  message: string
  waiverCents?: number
  refundCents?: number
}) {
  const titleId = useId()
  const credit = summary !== null && summary.balanceCents < 0

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h3 id={titleId}>Resumen de reserva</h3>
          </CardTitle>
          {stayLabel && <CardDescription>{stayLabel}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-4">
            {rooms
              .filter((room) => room.status !== "cancelled")
              .map((room, index) => (
                <RoomSummary
                  key={room.key}
                  room={room}
                  index={index}
                  currency={currency}
                />
              ))}
          </div>
          <Separator />
          <dl className="flex flex-col gap-2">
            <SummaryRow
              label="Importe habitaciones"
              cents={summary?.subtotalCents ?? null}
              currency={currency}
            />
            {!summary || summary.discountCents > 0 ? (
              <SummaryRow
                label="Descuentos"
                cents={summary ? -summary.discountCents : null}
                currency={currency}
              />
            ) : null}
            {waiverCents > 0 && (
              <SummaryRow
                label="Saldo condonado"
                cents={-waiverCents}
                currency={currency}
              />
            )}
          </dl>
          {showPayments ? (
            <dl className="flex flex-col gap-2">
              <SummaryRow
                label="Total de reserva"
                cents={summary?.totalCents ?? null}
                currency={currency}
              />
              <SummaryRow
                label="Pagado"
                cents={paidCents}
                currency={currency}
              />
              {refundCents > 0 && (
                <SummaryRow
                  label="Devuelto"
                  cents={refundCents}
                  currency={currency}
                />
              )}
            </dl>
          ) : null}
          {!summary ? (
            <p role="status" className="text-muted-foreground">
              {message}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <dl className="w-full text-sm font-semibold">
            <SummaryRow
              label={
                showPayments
                  ? credit
                    ? "Saldo a favor"
                    : "Saldo pendiente"
                  : "Total de reserva"
              }
              cents={
                summary
                  ? showPayments
                    ? Math.abs(summary.balanceCents)
                    : summary.totalCents
                  : null
              }
              currency={currency}
            />
          </dl>
        </CardFooter>
      </Card>
    </section>
  )
}

function RoomSummary({
  room,
  index,
  currency,
}: {
  room: BookingSummaryRoom
  index: number
  currency: string
}) {
  const cancelled = room.status === "cancelled"
  const charges = room.invalid ? null : room.charges
  const guests =
    room.adults === null || room.children === null
      ? "Revisa el número de huéspedes"
      : `${room.adults} ${room.adults === 1 ? "adulto" : "adultos"}${room.children > 0 ? ` · ${room.children} ${room.children === 1 ? "niño" : "niños"}` : ""}`

  return (
    <section
      aria-label={`Habitación ${index + 1}: ${room.typeName}`}
      className="flex min-w-0 flex-col gap-1"
    >
      <dl>
        <SummaryRow
          label={room.typeName}
          cents={cancelled ? null : (charges?.totalCents ?? null)}
          currency={currency}
          excluded={cancelled}
        />
      </dl>
      <p className="text-xs text-muted-foreground">
        {cancelled ? "Cancelada" : guests}
      </p>
      {room.stayLabel && (
        <p className="text-xs text-muted-foreground">{room.stayLabel}</p>
      )}
    </section>
  )
}

function SummaryRow({
  label,
  cents,
  currency,
  excluded = false,
}: {
  label: string
  cents: number | null
  currency: string
  excluded?: boolean
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
      <dt className="min-w-0 wrap-anywhere">{label}</dt>
      <dd className="shrink-0 text-right tabular-nums">
        {excluded ? (
          <span className="text-muted-foreground">Excluida</span>
        ) : cents === null ? (
          <span aria-label="No disponible">...</span>
        ) : (
          formatMoney(cents === 0 ? 0 : cents, currency)
        )}
      </dd>
    </div>
  )
}
