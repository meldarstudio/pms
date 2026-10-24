import assert from "node:assert/strict";
import type { Room, RoomType } from "../src/lib/api.ts";
import { calendarWindow, catalogCalendarRooms } from "./calendar-window.ts";

export type FakeMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "*";
/** An exact pathname, `:name` segments (`/reservations/:id/commands`), `*`, or a RegExp. */
export type FakePath = string | RegExp;

export type FakeRequest<TBody = unknown> = {
  method: string;
  url: URL;
  path: string;
  params: Record<string, string>;
  /** Parsed JSON request body; undefined when the request has none. */
  body: TBody;
  init: RequestInit | undefined;
};

/** Return a Response, any JSON value (sent with status 200), or undefined to fall through. */
export type FakeHandler<TBody = unknown> = (request: FakeRequest<TBody>) => unknown;

export type HeldRequest = {
  /** The held request once the portal has sent it. */
  readonly request: FakeRequest | undefined;
  release(response: Response): void;
};

type Route = {
  method: FakeMethod;
  match: (path: string) => Record<string, string> | null;
  handler: FakeHandler<never>;
  once: boolean;
};

type View = { method: FakeMethod; match: Route["match"]; items: unknown[]; bodies: boolean };

function matcher(path: FakePath): Route["match"] {
  if (path instanceof RegExp)
    return (actual) => {
      const result = path.exec(actual);
      return result ? { ...result.groups } : null;
    };
  if (path === "*") return () => ({});
  const expected = path.split("/");
  return (actual) => {
    const segments = actual.split("/");
    if (segments.length !== expected.length) return null;
    const params: Record<string, string> = {};
    for (const [index, segment] of expected.entries()) {
      if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(segments[index]);
      else if (segment !== segments[index]) return null;
    }
    return params;
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" ? input : "url" in input ? input.url : input.href);
}

/**
 * A route table installed at the portal's fetch seam. Newer routes win; a handler that
 * returns undefined falls through to older routes and then the defaults. It stores only
 * what tests seed or register and does not apply backend business rules.
 */
export function createFakeBackend() {
  const routes: Route[] = [];
  const views: View[] = [];
  const log: FakeRequest[] = [];
  const catalog: { roomTypes: RoomType[]; rooms: Room[] } = { roomTypes: [], rooms: [] };

  function add(method: FakeMethod, path: FakePath, handler: FakeHandler<never>, once: boolean) {
    const route: Route = { method, match: matcher(path), handler, once };
    routes.unshift(route);
    return () => {
      const index = routes.indexOf(route);
      if (index >= 0) routes.splice(index, 1);
    };
  }

  function matches(method: FakeMethod, request: FakeRequest) {
    return method === "*" || method === request.method;
  }

  function on<TBody = unknown>(method: FakeMethod, path: FakePath, handler: FakeHandler<TBody>) {
    return add(method, path, handler as FakeHandler<never>, false);
  }

  function once<TBody = unknown>(method: FakeMethod, path: FakePath, handler: FakeHandler<TBody>) {
    return add(method, path, handler as FakeHandler<never>, true);
  }

  function failOnce(
    method: FakeMethod,
    path: FakePath,
    status: number,
    body: unknown = { error: "Request failed" },
    headers?: HeadersInit,
  ) {
    return once(method, path, () => Response.json(body, { status, headers }));
  }

  function hold(method: FakeMethod, path: FakePath): HeldRequest {
    let request: FakeRequest | undefined;
    let resolve: ((response: Response) => void) | undefined;
    once(method, path, (sent) => {
      request = sent;
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    return {
      get request() {
        return request;
      },
      release(response) {
        assert.ok(resolve, `${method} ${String(path)} was released before it was requested`);
        resolve(response);
      },
    };
  }

  function view<T>(method: FakeMethod, path: FakePath, bodies: boolean) {
    const item: View = { method, match: matcher(path), items: [], bodies };
    for (const request of log) record(item, request);
    views.push(item);
    return item.items as T[];
  }

  function record(item: View, request: FakeRequest) {
    if (matches(item.method, request) && item.match(request.path))
      item.items.push(item.bodies ? request.body : request);
  }

  /** Live list of every request sent to this page, optionally filtered by method and path. */
  function requests<TBody = unknown>(method: FakeMethod = "*", path: FakePath = "*") {
    return view<FakeRequest<TBody>>(method, path, false);
  }

  /** Live list of the parsed JSON bodies sent to one method and path. */
  function bodies<TBody>(method: FakeMethod, path: FakePath) {
    return view<TBody>(method, path, true);
  }

  // Defaults answer the reads every screen makes from the seeded catalog.
  on("GET", "/session", () => ({ username: "hotelmanantial", propertyTimeZone: "America/Lima" }));
  on("GET", "/room-types", () => catalog.roomTypes);
  on("GET", "/rooms", () => catalog.rooms);
  on("GET", "/calendar", ({ url }) =>
    calendarWindow(url, {
      missingSetup:
        catalog.roomTypes.length === 0 ? "types" : catalog.rooms.length === 0 ? "rooms" : null,
      rooms: catalogCalendarRooms(
        catalog.rooms,
        new Map(catalog.roomTypes.map((type) => [type.id, type.name])),
      ),
    }),
  );
  on("GET", "/reservations", ({ url }) =>
    url.searchParams.get("paginated") === "true"
      ? {
          rows: [],
          total: 0,
          limit: Number(url.searchParams.get("limit") ?? 50),
          offset: Number(url.searchParams.get("offset") ?? 0),
        }
      : [],
  );
  on("GET", "/housekeeping", () => ({
    date: "2026-10-20",
    rooms: catalog.rooms.map((room) => ({
      ...room,
      roomTypeName: catalog.roomTypes.find((type) => type.id === room.roomTypeId)?.name ?? "Room",
      housekeepingStatus: "clean",
      housekeepingChangedAt: null,
      closed: false,
      inHouse: false,
      departing: false,
      arriving: false,
    })),
  }));
  on("GET", "/room-closures", () => []);
  on("GET", "/inventory", ({ url }) => ({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    currency: "PEN",
    roomTypes: [],
  }));

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    assert.equal(init?.credentials, "include", `${method} ${url.pathname} must send credentials`);
    const request: FakeRequest = {
      method,
      url,
      path: url.pathname,
      params: {},
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      init,
    };
    log.push(request);
    for (const item of views) record(item, request);
    // Iterate a copy: matching a one-shot route removes it from the table.
    for (const route of routes.slice()) {
      if (!matches(route.method, request)) continue;
      const params = route.match(request.path);
      if (!params) continue;
      // A one-shot route is spent once it matches, even while its response is pending.
      if (route.once) routes.splice(routes.indexOf(route), 1);
      const response = await route.handler({ ...request, params } as never);
      if (response === undefined) continue;
      return response instanceof Response ? response : Response.json(response);
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };

  return { catalog, on, once, failOnce, hold, requests, bodies, fetch };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;
