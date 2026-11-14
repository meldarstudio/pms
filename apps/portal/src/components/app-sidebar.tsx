import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type MouseEvent } from "react";
import {
  ArrowLeftIcon,
  BedDoubleIcon,
  BroomIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  CreditCardIcon,
  DoorOpenIcon,
  EllipsisVerticalIcon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { HotelLogo } from "@/components/hotel-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { accountRoleTitles } from "@/lib/account-roles";
import type { Session } from "@/lib/api";
import { useLogout, useSession } from "@/lib/queries";
import {
  activeNavigation,
  appNavigation,
  activeConfigurationSection,
  canOpenConfigurationSection,
  configurationSearch,
  configurationSections,
  forceSameUrlNavigation,
  type ConfigurationSection,
} from "@/lib/navigation";
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

const configurationIcons = {
  rooms: DoorOpenIcon,
  appearance: PaletteIcon,
  payments: CreditCardIcon,
  accounts: ShieldCheckIcon,
} satisfies Record<ConfigurationSection, LucideIcon>;

export function AppSidebar() {
  const location = useRouterState({ select: (state) => state.location });
  const { setOpenMobile } = useSidebar();
  const session = useSession().data;
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
  const visibleDestinations =
    session?.role === "owner" && import.meta.env.DEV
      ? [...destinations, { ...appNavigation.complaints, icon: ClipboardListIcon, search: {} }]
      : destinations;
  const sections = configurationSections.filter(({ id }) =>
    canOpenConfigurationSection(id, session?.role),
  );
  const activeSection = activeConfigurationSection(location);
  const [returnDestination, setReturnDestination] = useState<(typeof destinations)[number]["to"]>(
    appNavigation.reservations.to,
  );
  const appDestination = destinations.find(({ to }) => to === activeDestination?.to)?.to;
  if (appDestination && appDestination !== returnDestination) {
    setReturnDestination(appDestination);
  }
  const back = destinations.find(({ to }) => to === returnDestination) ?? destinations[0];

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
      <nav
        aria-label="Navegación principal"
        className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
      >
        <SidebarHeader className="items-center py-6">
          <HotelLogo className="h-7 w-28 text-sidebar-foreground" />
        </SidebarHeader>
        {activeSection ? (
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={
                        <Link to={back.to} search={back.search} onClick={closeMobileNavigation} />
                      }
                    >
                      <ArrowLeftIcon />
                      <span>Volver</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {sections.map(({ id, title }) => {
                    const Icon = configurationIcons[id];
                    const isActive = activeSection === id;
                    return (
                      <SidebarMenuItem key={id}>
                        <SidebarMenuButton
                          isActive={isActive}
                          render={
                            <Link
                              to={appNavigation.setup.to}
                              search={configurationSearch(id)}
                              replace={isActive}
                              state={isActive ? forceSameUrlNavigation : undefined}
                              activeOptions={{ exact: true }}
                              onClick={closeMobileNavigation}
                            />
                          }
                        >
                          <Icon />
                          <span>{title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        ) : (
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {visibleDestinations.map(({ to, label, icon: Icon, search }) => (
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
        )}
        <SidebarFooter className="gap-3">
          {!activeSection && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to={appNavigation.setup.to} onClick={closeMobileNavigation} />}
                >
                  <SettingsIcon />
                  <span>{appNavigation.setup.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
          {session && <AccountMenu username={session.username} role={session.role} />}
        </SidebarFooter>
      </nav>
    </Sidebar>
  );
}

function AccountMenu({ username, role }: Pick<Session, "username" | "role">) {
  const { isMobile } = useSidebar();
  const logout = useLogout();
  const roleTitle = accountRoleTitles[role];
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={logout.isPending}
            aria-label={`Cuenta de ${username}, ${roleTitle}`}
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar>
              <AvatarFallback>{username.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{username}</span>
              <span className="truncate text-muted-foreground">{roleTitle}</span>
            </div>
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : "right"} align="end">
            <DropdownMenuItem
              onClick={() =>
                logout.mutate(undefined, {
                  onError: (cause) => toastError("No se pudo cerrar la sesión", cause),
                })
              }
            >
              <LogOutIcon />
              Salir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
