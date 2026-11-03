import { Link, useRouterState } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import {
  BedDoubleIcon,
  BroomIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  LogOutIcon,
  Settings2Icon,
} from "lucide-react";
import logo from "@/assets/logo.svg";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLogout } from "@/lib/queries";
import { activeNavigation, appNavigation } from "@/lib/navigation";
import {
  calendarSearch,
  calendarStart,
  housekeepingSearch,
  inventorySearch,
  lastCalendarSearch,
  lastReservationsSearch,
  reservationsSearch,
} from "@/lib/route-search";
import { toastError } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

export function AppSidebar() {
  const location = useRouterState({ select: (state) => state.location });
  const { setOpenMobile } = useSidebar();
  const logout = useLogout();
  const { today } = usePropertyCalendar();
  const activeDestination = activeNavigation(location.pathname);
  const destinations = [
    {
      ...appNavigation.reservations,
      icon: ClipboardListIcon,
      search:
        location.pathname === appNavigation.reservations.to
          ? reservationsSearch(location.search)
          : (lastReservationsSearch.current ?? reservationsSearch({ day: today })),
    },
    {
      ...appNavigation.calendar,
      icon: CalendarDaysIcon,
      search:
        location.pathname === appNavigation.calendar.to
          ? calendarSearch(location.search)
          : (lastCalendarSearch.current ?? calendarSearch({ from: calendarStart(today) })),
    },
    { ...appNavigation.housekeeping, icon: BroomIcon, search: housekeepingSearch({}) },
    {
      ...appNavigation.inventory,
      icon: BedDoubleIcon,
      search: inventorySearch({ from: today }),
    },
  ] as const;

  function closeMobileNavigation(event: MouseEvent) {
    if (
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      setOpenMobile(false);
    }
  }

  return (
    <Sidebar collapsible="offcanvas">
      <nav aria-label="Navegación principal" className="flex min-h-0 flex-1 flex-col">
        <SidebarHeader className="items-center py-6">
          <img
            src={logo}
            alt="Hotel Manantial"
            width={112}
            height={28}
            className="h-7 w-28 scheme-light dark:scheme-dark"
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {destinations.map(({ to, label, icon: Icon, search }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      isActive={activeDestination?.to === to}
                      render={
                        <Link
                          to={to}
                          search={search}
                          activeOptions={{ includeSearch: false }}
                          onClick={closeMobileNavigation}
                        />
                      }
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-3 p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeDestination?.to === appNavigation.setup.to}
                render={<Link to={appNavigation.setup.to} onClick={closeMobileNavigation} />}
              >
                <Settings2Icon />
                <span>{appNavigation.setup.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Separator />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={logout.isPending}
                onClick={() =>
                  logout.mutate(undefined, {
                    onError: (cause) => toastError("No se pudo cerrar la sesión", cause),
                  })
                }
              >
                <LogOutIcon />
                <span>Salir</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </nav>
    </Sidebar>
  );
}
