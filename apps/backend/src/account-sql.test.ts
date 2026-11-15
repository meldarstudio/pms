import { hashPassword } from "better-auth/crypto";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { app } from "./index";
import { accountSql } from "./account-sql";
import { PORTAL_ORIGIN, login, loginBody } from "./test-support/auth";
import { createTestDb, type TestDb } from "./test-support/d1";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(() => db.close());

const session = (cookie: string) =>
  app.request("/session", { headers: { origin: PORTAL_ORIGIN, cookie } }, db.env);

describe("account script SQL", () => {
  it("creates an account that can sign in with its role", async () => {
    db.sqlite.exec(
      accountSql({
        username: "Recepcion",
        role: "staff",
        passwordHash: await hashPassword("reception password 1"),
        id: "reception",
        now: Date.now(),
      }),
    );
    const response = await login(db.env, {
      username: "recepcion",
      password: "reception password 1",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ username: "recepcion", role: "staff" });
  });

  it("resets an existing account's password and signs out its sessions", async () => {
    const before = (await login(db.env)).headers.getSetCookie()[0]!.split(";")[0]!;
    db.sqlite.exec(
      accountSql({
        username: "hotelmanantial",
        role: "staff",
        passwordHash: await hashPassword("the reset staff password"),
        id: "reset",
        now: Date.now(),
      }),
    );
    expect((await session(before)).status).toBe(401);
    expect((await login(db.env)).status).toBe(401);
    expect((await login(db.env, loginBody({ password: "the reset staff password" }))).status).toBe(
      200,
    );
  });
});
