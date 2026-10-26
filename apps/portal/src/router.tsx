import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { format, parseISO } from "date-fns";
import { propertyToday } from "@/lib/property-calendar";
import { useNavigate } from "@tanstack/react-router";
import App from "@/App";
import { RouteCrash } from "@/components/page-error";
import { ReservationPage } from "@/components/reservation-page";
import { Reservations } from "@/components/reservations";
import { RoomCalendar } from "@/components/room-calendar";
import { Housekeeping } from "@/components/housekeeping";
import { Inventory } from "@/components/inventory";
import { PropertySetup } from "@/components/property-setup";
import { Accounts } from "@/components/accounts";
import {
  calendarSearch,
  housekeepingSearch,
  inventorySearch,
  lastCalendarSearch,
  lastReservationsSearch,
  reservationsSearch,
} from "@/lib/route-search";

const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: () => (
    <main className="m-auto flex flex-col items-center gap-3 p-8">
      <h1 className="text-xl font-semibold">No se encontró esta página</h1>
      <Link
        to="/calendar"
        search={{ from: propertyToday(), span: 7 }}
        className="text-primary underline"
      >
        Ir al calendario
      </Link>
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({
      to: "/calendar",
      search: {
        from: propertyToday(),
        span: 7,
      },
      replace: true,
    });
  },
});

function CalendarRoute() {
  const search = calendarRoute.useSearch();
  const navigate = useNavigate({ from: "/calendar" });
  useEffect(() => {
    lastCalendarSearch.current = search;
  }, [search]);
  const start = parseISO(search.from);
  const update = (next: { from?: string; span?: 7 | 14 }) =>
    navigate({
      search: (previous) => ({ ...previous, ...next }),
      replace: true,
    });

  return (
    <RoomCalendar
      start={start}
      span={search.span}
      onStartChange={(date) => update({ from: format(date, "yyyy-MM-dd") })}
      onSpanChange={(span) => update({ span })}
      onOpenReservation={(id) =>
        void navigate({
          to: "/reservations/$reservationId",
          params: { reservationId: id },
          search: {
            origin: "calendar",
            returnTo: new URLSearchParams({
              from: search.from,
              span: String(search.span),
            }).toString(),
          },
        })
      }
    />
  );
}

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/calendar",
  validateSearch: calendarSearch,
  search: {
    middlewares: [stripSearchParams({ span: 7 })],
  },
  component: CalendarRoute,
});

function ReservationsRoute() {
  const search = reservationsRoute.useSearch();
  const navigate = useNavigate({ from: "/reservations" });
  useEffect(() => {
    lastReservationsSearch.current = search;
  }, [search]);
  return (
    <Reservations
      search={search}
      onSearchChange={(next) =>
        navigate({
          search: (previous) => ({ ...previous, ...next }),
          replace: true,
        })
      }
      onOpenReservation={(id) =>
        void navigate({
          to: "/reservations/$reservationId",
          params: { reservationId: id },
          search: {
            returnTo: new URLSearchParams(
              Object.entries(search).map(([key, value]) => [key, String(value)]),
            ).toString(),
          },
        })
      }
    />
  );
}

const reservationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reservations",
  validateSearch: reservationsSearch,
  search: {
    middlewares: [stripSearchParams({ q: "", balance: "all", assignment: "all", page: 0 })],
  },
  component: ReservationsRoute,
});

const reservationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reservations/$reservationId",
  validateSearch: (
    search: Record<string, unknown>,
  ): { returnTo?: string; origin?: "calendar" } => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
    origin: search.origin === "calendar" ? "calendar" : undefined,
  }),
  component: ReservationRoute,
});

function ReservationRoute() {
  const { reservationId } = reservationRoute.useParams();
  const { returnTo, origin } = reservationRoute.useSearch();
  const navigate = useNavigate();
  const backSearch =
    origin !== "calendar" && returnTo !== undefined
      ? reservationsSearch(Object.fromEntries(new URLSearchParams(returnTo)))
      : (lastReservationsSearch.current ?? reservationsSearch({}));
  return (
    <ReservationPage
      id={reservationId}
      backSearch={backSearch}
      onBack={() => void navigate({ to: "/reservations", search: backSearch })}
    />
  );
}

function InventoryRoute() {
  const search = inventoryRoute.useSearch();
  const navigate = useNavigate({ from: "/inventory" });
  const start = parseISO(search.from);
  const update = (next: { from?: string; span?: 7 | 14 }) =>
    navigate({
      search: (previous) => ({ ...previous, ...next }),
      replace: true,
    });
  return (
    <Inventory
      start={start}
      span={search.span}
      onStartChange={(date) => update({ from: format(date, "yyyy-MM-dd") })}
      onSpanChange={(span) => update({ span })}
    />
  );
}

const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory",
  validateSearch: inventorySearch,
  search: {
    middlewares: [stripSearchParams({ span: 14 })],
  },
  component: InventoryRoute,
});

function HousekeepingRoute() {
  const search = housekeepingRoute.useSearch();
  const navigate = useNavigate({ from: "/housekeeping" });
  return (
    <Housekeeping
      view={search.view}
      onViewChange={(view) => void navigate({ search: { view }, replace: true })}
    />
  );
}

const housekeepingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/housekeeping",
  validateSearch: housekeepingSearch,
  search: {
    middlewares: [stripSearchParams({ view: "to-clean" })],
  },
  component: HousekeepingRoute,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: PropertySetup,
});

const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts",
  component: Accounts,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  calendarRoute,
  reservationsRoute,
  reservationRoute,
  housekeepingRoute,
  inventoryRoute,
  setupRoute,
  accountsRoute,
]);

export const router = createRouter({ routeTree, defaultErrorComponent: RouteCrash });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
