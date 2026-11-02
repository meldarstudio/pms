import assert from "node:assert/strict";
import type { Room, RoomType } from "../src/lib/api.ts";
import { calendarWindow, catalogCalendarRooms } from "./calendar-window.ts";

export type FakeMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "*";
export type FakePath = string | RegExp;

export type FakeRequest<TBody = unknown> = {
  method: string;
  url: URL;
  path: string;
  params: Record<string, string>;
  body: TBody;
  init: RequestInit | undefined;
};

export type FakeHandler<TBody = unknown> = (request: FakeRequest<TBody>) => unknown;

export type HeldRequest = {
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

function legacyListForPage(request: FakeRequest, response: unknown) {
  return Array.isArray(response) && request.url.searchParams.get("paginated") === "true";
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" ? input : "url" in input ? input.url : input.href);
}

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

  function requests<TBody = unknown>(method: FakeMethod = "*", path: FakePath = "*") {
    return view<FakeRequest<TBody>>(method, path, false);
  }

  function bodies<TBody>(method: FakeMethod, path: FakePath) {
    return view<TBody>(method, path, true);
  }

  on("GET", "/session", () => ({
    username: "hotelmanantial",
    role: "staff",
    propertyTimeZone: "America/Lima",
  }));
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
  on("GET", "/availability", ({ url }) => ({
    checkIn: url.searchParams.get("checkIn"),
    checkOut: url.searchParams.get("checkOut"),
    nights: 1,
    currency: "PEN",
    roomTypes: catalog.roomTypes.map((type) => {
      const freeRoomIds = catalog.rooms
        .filter((room) => room.roomTypeId === type.id)
        .map((room) => room.id);
      return {
        id: type.id,
        name: type.name,
        maxAdults: type.maxAdults,
        maxChildren: type.maxChildren,
        free: freeRoomIds.length,
        freeRoomIds,
        totalCents: 0,
        nights: [],
      };
    }),
  }));
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
    for (const route of routes.slice()) {
      if (!matches(route.method, request)) continue;
      const params = route.match(request.path);
      if (!params) continue;
      if (route.once) routes.splice(routes.indexOf(route), 1);
      const response = await route.handler({ ...request, params } as never);
      if (response === undefined || legacyListForPage(request, response)) continue;
      return response instanceof Response ? response : Response.json(response);
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };

  return { catalog, on, once, failOnce, hold, requests, bodies, fetch };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;
