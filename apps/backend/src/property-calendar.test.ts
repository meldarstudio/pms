import { describe, expect, it } from "vite-plus/test";
import { app } from "./index";
import { login, signIn } from "./test-support/auth";
import { createTestDb } from "./test-support/d1";

describe("authenticated property calendar configuration", () => {
  it.each([
    ["a missing", undefined],
    ["an unknown", "Not/AZone"],
    ["a numeric offset", "+05:00"],
  ])(
    "reports %s deployment timezone without issuing a session",
    async (_name, PROPERTY_TIME_ZONE) => {
      const db = await createTestDb();
      const valid = db.env;
      const cookie = await signIn(valid);
      const env = { ...valid, PROPERTY_TIME_ZONE: PROPERTY_TIME_ZONE! };
      for (const response of [
        await login(env),
        await app.request("/session", { headers: { cookie } }, env),
      ]) {
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
          error: "PROPERTY_TIME_ZONE must be a supported IANA timezone",
        });
        expect(response.headers.get("set-cookie")).toBeNull();
      }
      db.close();
    },
  );
});
