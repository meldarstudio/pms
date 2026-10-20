import { Outlet, useRouterState } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export function App() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const title = pathname.startsWith("/reservations")
    ? "Reservas"
    : pathname === "/inventory"
      ? "Inventario y tarifas"
      : pathname === "/setup"
        ? "Configuración"
        : "Calendario";

  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "14rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="data-vertical:h-4 self-center" />
          <span className="text-xs font-medium">{title}</span>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
