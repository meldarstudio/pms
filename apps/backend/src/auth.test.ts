import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import app from "./index";
import type { Env } from "./env";
import { createTestDb, type TestDb } from "./test-support/d1";
import { ACCOUNTS, PORTAL_ORIGIN, login, loginBody, sessionCookie } from "./test-support/auth";

let db: TestDb;
let env: Env["Bindings"];

beforeEach(async () => {
  db = await createTestDb();
  env = db.env;
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function get(path: string, cookie?: string, bindings = env) {
  return app.request(
    path,
    { headers: { origin: PORTAL_ORIGIN, ...(cookie ? { cookie } : {}) } },
    bindings,
  );
}

describe("sign-in", () => {
  it("signs staff in with their role and the property timezone, then reaches guarded routes", async () => {
    const configured = { ...env, PROPERTY_TIME_ZONE: "America/New_York" };
    const response = await login(configured);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      username: ACCOUNTS.staff.username,
      role: "staff",
      propertyTimeZone: "America/New_York",
    });
    const setCookie = response.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=2592000/i);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(setCookie).not.toMatch(/Secure/i);

    const session = await get("/session", sessionCookie(response), configured);
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({
      username: ACCOUNTS.staff.username,
      role: "staff",
      propertyTimeZone: "America/New_York",
    });
    expect((await get("/rooms", sessionCookie(response))).status).toBe(200);
  });

  it("signs the owner in with the owner role", async () => {
    const response = await login(env, loginBody({}, "owner"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      username: ACCOUNTS.owner.username,
      role: "owner",
    });
  });

  it.each([
    ["wrong password", { password: "not the password" }],
    ["wrong username", { username: "someone-else" }],
  ])("rejects a %s with the same generic error and no cookie", async (_name, override) => {
    const response = await login(env, loginBody(override));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid credentials" });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("accepts the username in any letter case", async () => {
    const response = await login(env, loginBody({ username: "HotelManantial" }));
    expect(response.status).toBe(200);
  });

  it("returns 429 without checking credentials once the limit is hit", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const response = await login({ ...env, LOGIN_LIMITER: { limit } });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too many login attempts" });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("rate-limits by the caller's IP address", async () => {
    const limit = vi.fn(async () => ({ success: true }));
    await app.request(
      "/login",
      {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
        body: JSON.stringify(loginBody()),
      },
      { ...env, LOGIN_LIMITER: { limit } },
    );
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
  });

  it("has no sign-up route", async () => {
    const response = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: PORTAL_ORIGIN },
        body: JSON.stringify({
          email: "new@example.com",
          password: "a long new password",
          name: "New",
        }),
      },
      env,
    );
    expect(response.status).toBe(401);
    expect((await login(env, { username: "new", password: "a long new password" })).status).toBe(
      401,
    );
  });
});

describe("session guard", () => {
  it.each([
    ["reads", "GET", "/reservations", 401, { error: "unauthorized" }],
    ["commands", "POST", "/reservations/any/commands", 401, { error: "unauthorized" }],
    ["unknown paths", "GET", "/does-not-exist", 401, { error: "unauthorized" }],
    ["the health check", "GET", "/", 200, { name: "pms" }],
  ])("answers %s without a session", async (_name, method, path, status, body) => {
    const response = await app.request(path, { method }, env);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
  });

  it("marks the cookie Secure over HTTPS", async () => {
    const response = await app.request(
      "https://api.hotelmanantialchurin.com/login",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: PORTAL_ORIGIN },
        body: JSON.stringify(loginBody()),
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("\n")).toMatch(/Secure/i);
  });

  it("rejects a cookie with a forged signature or a rotated secret", async () => {
    const response = await login(env);
    const cookie = sessionCookie(response);
    expect((await get("/session", `${cookie.slice(0, -4)}AAAA`)).status).toBe(401);
    const rotated = { ...env, SESSION_SECRET: "a-new-session-secret-that-is-long-enough" };
    expect((await get("/session", cookie, rotated)).status).toBe(401);
  });

  it("ends a session after 30 days without use, and extends it while in use", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
    const cookie = sessionCookie(await login(env));
    const idle = sessionCookie(await login(env));

    vi.setSystemTime(new Date("2026-11-01T15:00:00Z"));
    const used = await get("/session", cookie);
    expect(used.status).toBe(200);
    expect(used.headers.getSetCookie().join("\n")).toMatch(/Max-Age=2592000/i);

    vi.setSystemTime(new Date("2026-11-09T15:01:00Z"));
    expect((await get("/session", idle)).status).toBe(401);
    expect((await get("/session", cookie)).status).toBe(200);
  });

  it("ends the session on logout so the old cookie no longer works", async () => {
    const cookie = sessionCookie(await login(env));
    const response = await app.request(
      "/logout",
      { method: "POST", headers: { cookie, origin: PORTAL_ORIGIN } },
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("\n")).toMatch(/Max-Age=0/i);
    expect((await get("/session", cookie)).status).toBe(401);
  });

  it("fails closed and logs when the session secret is not configured", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cookie = sessionCookie(await login(env));
    const broken = { ...env, SESSION_SECRET: "" };
    expect((await get("/session", cookie, broken)).status).toBe(401);
    expect((await login(broken)).status).toBe(401);
    expect(error).toHaveBeenCalled();
  });
});

describe("cross-origin access", () => {
  it("answers the preflight for the portal origin without a session", async () => {
    const response = await app.request(
      "/reservations",
      {
        method: "OPTIONS",
        headers: {
          origin: PORTAL_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      },
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(PORTAL_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("lets the portal read a 401 response", async () => {
    const response = await get("/rooms");
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(PORTAL_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("does not allow an origin that is not configured", async () => {
    const response = await app.request("/", { headers: { origin: "http://localhost:5173" } }, env);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows each configured origin", async () => {
    const both = { ...env, ALLOWED_ORIGINS: `${PORTAL_ORIGIN}, http://localhost:5173` };
    const response = await app.request("/", { headers: { origin: "http://localhost:5173" } }, both);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });
});
