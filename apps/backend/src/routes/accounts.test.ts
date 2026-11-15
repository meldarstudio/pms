import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { app } from "../index";
import { createTestDb, type TestDb } from "../test-support/d1";
import { ACCOUNTS, PORTAL_ORIGIN, login, loginBody, sessionCookie } from "../test-support/auth";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(() => db.close());

const NEW_PASSWORD = "a brand new staff password";

function request(path: string, cookie: string, method = "GET", body?: unknown) {
  return app.request(
    path,
    {
      method,
      headers: {
        origin: PORTAL_ORIGIN,
        cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    db.env,
  );
}

async function cookieFor(role: "staff" | "owner") {
  return sessionCookie(await login(db.env, loginBody({}, role)));
}

async function staffAccountId(ownerCookie: string) {
  const accounts = (await (await request("/accounts", ownerCookie)).json()) as {
    id: string;
    role: string;
  }[];
  return accounts.find((account) => account.role === "staff")!.id;
}

describe("account management", () => {
  it.each([
    ["list accounts", "GET", "/accounts", undefined],
    ["set a password", "PUT", "/accounts/any/password", { password: NEW_PASSWORD }],
    [
      "change its own password",
      "PUT",
      "/account/password",
      { currentPassword: ACCOUNTS.staff.password, newPassword: NEW_PASSWORD },
    ],
  ])("does not let the staff account %s", async (_name, method, path, body) => {
    const response = await request(path, await cookieFor("staff"), method, body);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "owner account required" });
  });

  it("sets the staff password and signs out every staff session, but not the owner", async () => {
    const owner = await cookieFor("owner");
    const staffSessions = [await cookieFor("staff"), await cookieFor("staff")];
    const id = await staffAccountId(owner);

    const response = await request(`/accounts/${id}/password`, owner, "PUT", {
      password: NEW_PASSWORD,
    });
    expect(response.status).toBe(200);

    for (const cookie of staffSessions)
      expect((await request("/session", cookie)).status).toBe(401);
    expect((await request("/session", owner)).status).toBe(200);
    expect((await login(db.env)).status).toBe(401);
    expect((await login(db.env, loginBody({ password: NEW_PASSWORD }))).status).toBe(200);
  });

  it("does not set the owner's own password without the current one", async () => {
    const owner = await cookieFor("owner");
    const accounts = (await (await request("/accounts", owner)).json()) as {
      id: string;
      role: string;
    }[];
    const ownerId = accounts.find((account) => account.role === "owner")!.id;
    const response = await request(`/accounts/${ownerId}/password`, owner, "PUT", {
      password: NEW_PASSWORD,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "change your own password with your current password",
    });
  });
});

describe("owner password", () => {
  it("changes the owner's password, keeps this session, and ends the others", async () => {
    const owner = await cookieFor("owner");
    const otherDevice = await cookieFor("owner");
    const response = await request("/account/password", owner, "PUT", {
      currentPassword: ACCOUNTS.owner.password,
      newPassword: NEW_PASSWORD,
    });
    expect(response.status).toBe(200);
    const current = sessionCookie(response) || owner;

    expect((await request("/session", current)).status).toBe(200);
    expect((await request("/session", otherDevice)).status).toBe(401);
    expect((await login(db.env, loginBody({ password: NEW_PASSWORD }, "owner"))).status).toBe(200);
  });

  it("rejects a wrong current password", async () => {
    const owner = await cookieFor("owner");
    const response = await request("/account/password", owner, "PUT", {
      currentPassword: "not the password",
      newPassword: NEW_PASSWORD,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "current password is incorrect" });
    expect(response.headers.get("x-error-field")).toBe("currentPassword");
    expect((await login(db.env, loginBody({}, "owner"))).status).toBe(200);
  });
});
