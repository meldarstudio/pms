import { useCallback, useRef, useState } from "react"
import { ArrowLeftIcon } from "lucide-react"
import {
  BookingEditor,
  DiscardChanges,
  ReservationStatus,
} from "@/components/room-booking-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FieldError } from "@/components/ui/field"
import { useReservation } from "@/lib/queries"

export function ReservationPage({
  id,
  onBack,
  onDirtyChange: reportDirty,
}: {
  id: string
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const query = useReservation(id)
  const dirty = useRef(false)
  const onDirtyChange = useCallback(
    (value: boolean) => {
      dirty.current = value
      reportDirty(value)
    },
    [reportDirty]
  )
  const [leaving, setLeaving] = useState(false)
  const [tab, setTab] = useState("details")
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-8">
      <header className="flex flex-col items-start gap-4">
        <Button
          variant="ghost"
          onClick={() => (dirty.current ? setLeaving(true) : onBack())}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a reservas
        </Button>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">
              Reserva {query.data?.code ?? ""}
            </h1>
            {query.data && <ReservationStatus detail={query.data} />}
          </div>
          <p className="mt-1 text-muted-foreground">
            Información completa de la reserva y sus estancias.
          </p>
        </div>
      </header>
      {query.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : query.error ? (
        <>
          <FieldError>{query.error.message}</FieldError>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => void query.refetch()}
          >
            Reintentar
          </Button>
        </>
      ) : (
        query.data && (
          <BookingEditor
            key={id}
            detail={query.data}
            full
            initialTab={tab}
            onTabChange={setTab}
            onDirtyChange={onDirtyChange}
            onRefresh={() => void query.refetch()}
          />
        )
      )}
      {leaving && (
        <DiscardChanges onStay={() => setLeaving(false)} onLeave={onBack} />
      )}
    </main>
  )
}
