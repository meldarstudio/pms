import { RoomCalendar } from "@/components/room-calendar"
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
        <EmptyDescription>This view is not built yet.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function App() {
  return (
    <Tabs defaultValue="calendar" className="h-svh gap-0 overflow-hidden">
      <header className="border-b px-2">
        <TabsList variant="line" className="h-10">
          <TabsTrigger value="dashboard" className="px-3">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="calendar" className="px-3">
            Calendar
          </TabsTrigger>
          <TabsTrigger value="reservations" className="px-3">
            Reservations
          </TabsTrigger>
        </TabsList>
      </header>
      <TabsContent value="dashboard" className="flex min-h-0 flex-1">
        <Later title="Dashboard" />
      </TabsContent>
      <TabsContent
        value="calendar"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <RoomCalendar />
      </TabsContent>
      <TabsContent value="reservations" className="flex min-h-0 flex-1">
        <Later title="Reservations" />
      </TabsContent>
    </Tabs>
  )
}

export default App
