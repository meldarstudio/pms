import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { format, startOfToday } from "date-fns";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLogout } from "@/lib/queries";
import { toastError } from "@/lib/toast";
import { lastCalendarSearch, lastReservationsSearch, reservationsSearch } from "@/lib/route-search";

export function App() {
  const navigate = useNavigate();
  const logout = useLogout();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const tab = pathname.startsWith("/reservations")
    ? "reservations"
    : pathname === "/inventory"
      ? "inventory"
      : "calendar";

  function changeTab(value: string) {
    if (value === "reservations") {
      void navigate({
        to: "/reservations",
        search: lastReservationsSearch.current ?? reservationsSearch({}),
      });
    }
    if (value === "calendar") {
      const search = lastCalendarSearch.current ?? {
        from: format(startOfToday(), "yyyy-MM-dd"),
        span: 7 as const,
      };
      void navigate({ to: "/calendar", search });
    }
    if (value === "inventory") {
      const today = format(startOfToday(), "yyyy-MM-dd");
      void navigate({ to: "/inventory", search: { from: today, span: 14 } });
    }
  }

  return (
    <Tabs value={tab} onValueChange={changeTab} className="h-svh gap-0 overflow-hidden">
      <header className="flex shrink-0 items-center gap-6 overflow-x-auto border-b px-4">
        <span className="text-sm font-semibold tracking-tight">
          PMS
          <span className="ml-2 text-xs font-normal text-muted-foreground">Recepción</span>
        </span>
        <TabsList variant="line" className="-mb-px h-12">
          <TabsTrigger value="reservations">Reservas</TabsTrigger>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="inventory">Inventario y tarifas</TabsTrigger>
        </TabsList>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, {
              onError: (cause) => toastError("No se pudo cerrar la sesión", cause),
            })
          }
        >
          <LogOutIcon data-icon="inline-start" />
          Salir
        </Button>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </Tabs>
  );
}

export default App;
