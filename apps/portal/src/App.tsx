import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { format, startOfToday } from "date-fns"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { lastCalendarSearch, lastReservationsSearch } from "@/lib/route-search"

export function App() {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const tab = pathname.startsWith("/reservations")
    ? "reservations"
    : pathname === "/inventory"
      ? "inventory"
      : "calendar"

  function changeTab(value: string) {
    if (value === "reservations") {
      void navigate({
        to: "/reservations",
        search: lastReservationsSearch.current,
      })
    }
    if (value === "calendar") {
      const search = lastCalendarSearch.current ?? {
        from: format(startOfToday(), "yyyy-MM-dd"),
        span: 7 as const,
      }
      void navigate({ to: "/calendar", search })
    }
    if (value === "inventory") {
      const today = format(startOfToday(), "yyyy-MM-dd")
      void navigate({ to: "/inventory", search: { from: today, span: 14 } })
    }
  }

  return (
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </Tabs>
  )
}

export default App
