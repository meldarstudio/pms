import { Outlet, useRouterState } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeaderActionsContext } from "@/components/page-header-actions";
import { PagePrimaryActionContext } from "@/components/page-primary-action";
import { PageTitleContext } from "@/components/page-title";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { activeNavigation, appNavigation } from "@/lib/navigation";

const SIDEBAR_STORAGE_KEY = "pms.sidebar-open";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const [primaryAction, setPrimaryAction] = useState<HTMLDivElement | null>(null);
  const [pageTitle, setPageTitle] = useState<HTMLDivElement | null>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const title = activeNavigation(pathname)?.label ?? appNavigation.calendar.label;

  function handleSidebarOpenChange(open: boolean) {
    setSidebarOpen(open);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
    } catch {}
  }

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "14rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-2.5">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="data-vertical:h-4 data-vertical:self-center"
          />
          <div ref={setPageTitle} className="peer flex min-w-0 empty:hidden" />
          <span className="text-xs font-medium peer-[:not(:empty)]:hidden">{title}</span>
          <div ref={setHeaderActions} className="ml-auto flex items-center gap-2" />
        </header>
        <div ref={setPrimaryAction} />
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          style={
            {
              "--primary-action-clearance": "calc(4rem + env(safe-area-inset-bottom))",
            } as CSSProperties
          }
        >
          <PageTitleContext value={pageTitle}>
            <PageHeaderActionsContext value={headerActions}>
              <PagePrimaryActionContext value={primaryAction}>
                <Outlet />
              </PagePrimaryActionContext>
            </PageHeaderActionsContext>
          </PageTitleContext>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
