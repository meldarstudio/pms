import { Outlet, useRouterState } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeaderActionsContext } from "@/components/page-header-actions";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { activeNavigation, appNavigation } from "@/lib/navigation";

export function App() {
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const title = activeNavigation(pathname)?.label ?? appNavigation.calendar.label;

  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "14rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="data-vertical:h-4 data-vertical:self-center"
          />
          <span className="text-xs font-medium">{title}</span>
          <div ref={setHeaderActions} className="ml-auto flex items-center gap-2" />
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PageHeaderActionsContext value={headerActions}>
            <Outlet />
          </PageHeaderActionsContext>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
