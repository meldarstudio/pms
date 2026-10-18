import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import app from "./index";
import type { Env } from "./env";
import {
  PORTAL_ORIGIN,
  STAFF_USERNAME,
  authEnv,
  login,
  loginBody,
  signIn,
} from "./test-support/auth";

let env: Env["Bindings"];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  env = await authEnv();
});

afterEach(() => {
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

describe("staff login", () => {
  it("signs in and then reaches guarded routes", async () => {
    const response = await login(env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      username: STAFF_USERNAME,
      propertyTimeZone: "America/Lima",
    });
    const setCookie = response.headers.getSetCookie()[0]!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=2592000/i);
    expect(setCookie).not.toMatch(/Domain=/i);

    const session = await get("/session", setCookie.split(";")[0]);
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({
      username: STAFF_USERNAME,
      propertyTimeZone: "America/Lima",
    });
  });

  it("marks the cookie Secure when served over HTTPS", async () => {
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
    expect(response.headers.getSetCookie()[0]).toMatch(/Secure/i);
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

  it("rejects a login with a missing field", async () => {
    const response = await login(env, { username: STAFF_USERNAME });
    expect(response.status).toBe(400);
  });

  it("returns 429 without checking credentials once the limit is hit", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const limited = await authEnv({ LOGIN_LIMITER: { limit } });
    const response = await login(limited);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too many login attempts" });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("rate-limits by the caller's IP address", async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const limited = await authEnv({ LOGIN_LIMITER: { limit } });
    await app.request(
      "/login",
      {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
        body: JSON.stringify(loginBody()),
      },
      limited,
    );
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
  });
});

describe("session guard", () => {
  it.each([
    ["GET", "/rooms"],
    ["GET", "/room-types"],
    ["GET", "/room-closures?from=2026-10-01&to=2026-10-31"],
    ["GET", "/availability?checkIn=2026-10-10"],
    ["GET", "/inventory?from=2026-10-10&to=2026-10-17"],
    ["GET", "/reservations"],
    ["POST", "/reservations"],
    ["POST", "/reservations/any/commands"],
    ["GET", "/guests/any"],
    ["POST", "/payments"],
    ["GET", "/session"],
    ["POST", "/logout"],
    ["GET", "/does-not-exist"],
  ])("returns 401 for %s %s without a session", async (method, path) => {
    const response = await app.request(path, { method }, env);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("leaves the health check public", async () => {
    const response = await app.request("/", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "pms" });
  });

  it("rejects a cookie with a forged signature", async () => {
    const cookie = await signIn(env);
    const forged = `${cookie.slice(0, -4)}AAAA`;
    expect((await get("/session", forged)).status).toBe(401);
  });

  it("rejects a cookie signed with a rotated secret", async () => {
    const cookie = await signIn(env);
    const rotated = await authEnv({ SESSION_SECRET: "a-new-secret" });
    expect((await get("/session", cookie, rotated)).status).toBe(401);
  });

  it("rejects a session after 30 days", async () => {
    const cookie = await signIn(env);
    vi.setSystemTime(new Date("2026-11-08T14:59:00Z"));
    expect((await get("/session", cookie)).status).toBe(200);
    vi.setSystemTime(new Date("2026-11-09T15:01:00Z"));
    expect((await get("/session", cookie)).status).toBe(401);
  });

  it("clears the cookie on logout", async () => {
    const cookie = await signIn(env);
    const response = await app.request(
      "/logout",
      { method: "POST", headers: { cookie, origin: PORTAL_ORIGIN } },
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toMatch(/Max-Age=0/i);
  });

  it.each([
    ["session secret", { SESSION_SECRET: "" }],
    ["password hash", { STAFF_PASSWORD_HASH: "" }],
  ])("fails closed and logs when the %s is not configured", async (_name, override) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const signedIn = await signIn(env);
    const broken = await authEnv(override);
    expect((await get("/session", signedIn, broken)).status).toBe(401);
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

  it.each([
    "https://pms-portal.meldar.workers.dev",
    "https://evil.example",
    "http://localhost:5173",
  ])("does not allow %s unless configured", async (origin) => {
    const response = await app.request("/", { headers: { origin } }, env);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows each configured origin", async () => {
    const both = await authEnv({
      ALLOWED_ORIGINS: `${PORTAL_ORIGIN}, http://localhost:5173`,
    });
    const response = await app.request("/", { headers: { origin: "http://localhost:5173" } }, both);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });
});
