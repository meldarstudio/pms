import { describe, expect, it } from "vite-plus/test";
import app from "./index";
import { authEnv, login, signIn } from "./test-support/auth";

describe("authenticated property calendar configuration", () => {
  it("exposes deployment metadata at login and for an existing session", async () => {
    const env = await authEnv({ PROPERTY_TIME_ZONE: "America/New_York" });
    const response = await login(env);
    expect(await response.json()).toEqual({
      username: "hotelmanantial",
      propertyTimeZone: "America/New_York",
    });
    const cookie = await signIn(env);
    const session = await app.request("/session", { headers: { cookie } }, env);
    expect(await session.json()).toEqual({
      username: "hotelmanantial",
      propertyTimeZone: "America/New_York",
    });
  });

  it.each([undefined, "", "Not/AZone", "+05:00"])(
    "reports invalid deployment timezone %s without issuing a session",
    async (PROPERTY_TIME_ZONE) => {
      const valid = await authEnv();
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
    },
  );
});
