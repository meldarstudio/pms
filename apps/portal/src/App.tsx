import { Outlet, useRouterState } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeaderActionsContext } from "@/components/page-header-actions";
import { PagePrimaryActionContext } from "@/components/page-primary-action";
import { PageTitleContext } from "@/components/page-title";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { activeNavigation, appNavigation } from "@/lib/navigation";
import { useIsTablet } from "@/hooks/use-mobile";

const SIDEBAR_STORAGE_KEY = "pms.sidebar-open";

export function App() {
  const tablet = useIsTablet();
  const [tabletSidebarOpen, setTabletSidebarOpen] = useState(false);
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
      open={tablet ? tabletSidebarOpen : sidebarOpen}
      onOpenChange={tablet ? setTabletSidebarOpen : handleSidebarOpenChange}
      className="fixed inset-0 h-dvh min-h-0 overflow-hidden bg-background"
      style={{ "--sidebar-width": "14rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <header className="sticky top-0 z-10 flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b bg-background px-2.5 pt-[env(safe-area-inset-top)]">
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
              "--primary-action-clearance": "5rem",
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
