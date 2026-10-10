import { Inventory } from "@/components/inventory"
import { RoomCalendar } from "@/components/room-calendar"
import { StatusExamples } from "@/components/status-examples"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function Later({ title }: { title: string }) {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          Esta sección aún no está disponible.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function App() {
  return (
    <Tabs defaultValue="calendar" className="h-svh gap-0 overflow-hidden">
      <header className="shrink-0 overflow-x-auto border-b px-2">
        <TabsList variant="line" className="h-10">
          <TabsTrigger value="dashboard" className="px-3">
            Inicio
          </TabsTrigger>
          <TabsTrigger value="calendar" className="px-3">
            Calendario
          </TabsTrigger>
          <TabsTrigger value="inventory" className="px-3">
            Inventario
          </TabsTrigger>
          <TabsTrigger value="reservations" className="px-3">
            Reservas
          </TabsTrigger>
          <TabsTrigger value="status-examples" className="px-3">
            Ejemplos de estado
          </TabsTrigger>
        </TabsList>
      </header>
      <TabsContent value="dashboard" className="flex min-h-0 flex-1">
        <Later title="Inicio" />
      </TabsContent>
      <TabsContent
        value="calendar"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <RoomCalendar />
      </TabsContent>
      <TabsContent
        value="inventory"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <Inventory />
      </TabsContent>
      <TabsContent value="reservations" className="flex min-h-0 flex-1">
        <Later title="Reservas" />
      </TabsContent>
      <TabsContent value="status-examples" className="flex min-h-0 flex-1">
        <StatusExamples />
      </TabsContent>
    </Tabs>
  )
}

export default App
