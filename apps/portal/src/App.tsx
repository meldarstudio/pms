import { Inventory } from "@/components/inventory"
import { useCallback, useRef, useState } from "react"
import { DiscardChanges } from "@/components/room-booking-dialog"
import { ReservationPage } from "@/components/reservation-page"
import { RoomCalendar } from "@/components/room-calendar"
import { Reservations } from "@/components/reservations"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
export function App() {
  const [tab, setTab] = useState("calendar")
  const [reservationId, setReservationId] = useState<string | null>(null)
  const dirty = useRef(false)
  const [leave, setLeave] = useState<(() => void) | null>(null)
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value
  }, [])
  function changeTab(value: string) {
    const change = () => {
      dirty.current = false
      setTab(value)
    }
    if (dirty.current && value !== tab) setLeave(() => change)
    else change()
  }
  function openReservation(id: string) {
    const open = () => {
      if (id !== reservationId) dirty.current = false
      setReservationId(id)
      setTab("reservations")
    }
    if (dirty.current && id !== reservationId) setLeave(() => open)
    else open()
  }
  return (
    <>
      <Tabs
        value={tab}
        onValueChange={changeTab}
        className="h-svh gap-0 overflow-hidden"
      >
        <header className="flex shrink-0 items-center gap-6 overflow-x-auto border-b px-4">
          <span className="text-sm font-semibold tracking-tight">
            PMS
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Recepción
            </span>
          </span>
          <TabsList variant="line" className="h-12">
            <TabsTrigger value="reservations">Reservas</TabsTrigger>
            <TabsTrigger value="calendar">Calendario</TabsTrigger>
            <TabsTrigger value="inventory">Inventario y tarifas</TabsTrigger>
          </TabsList>
        </header>
        <TabsContent value="reservations" className="flex min-h-0 flex-1">
          {reservationId ? (
            <ReservationPage
              key={reservationId}
              id={reservationId}
              onBack={() => {
                dirty.current = false
                setReservationId(null)
              }}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <Reservations onOpenReservation={openReservation} />
          )}
        </TabsContent>
        <TabsContent
          value="calendar"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <RoomCalendar onOpenReservation={openReservation} />
        </TabsContent>
        <TabsContent
          value="inventory"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <Inventory />
        </TabsContent>
      </Tabs>
      {leave && (
        <DiscardChanges
          onStay={() => setLeave(null)}
          onLeave={() => {
            setLeave(null)
            leave()
          }}
        />
      )}
    </>
  )
}
export default App
