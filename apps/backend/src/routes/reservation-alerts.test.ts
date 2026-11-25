import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { app } from "../index";
import { PORTAL_ORIGIN, signIn } from "../test-support/auth";
import { createTestDb, type TestDb } from "../test-support/d1";
import { webPushFixture } from "../test-support/web-push";

const phone = "a4abdc3d-eaaa-4f84-8c61-ccebb7cceee3";
const desktop = "3cae8249-41c3-4b87-859a-5f7e142b34e1";
const receiver = webPushFixture();

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  Object.assign(db.env, receiver.configuration);
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

const subscription = (deviceId: string) => ({
  deviceId,
  endpoint: `https://fcm.googleapis.com/fcm/send/${deviceId}`,
  keys: receiver.keys,
});

const settings = (id: string) => db.request(`/reservation-alerts?deviceId=${id}`);

it("explicit sign-out stops alerts on that device, not another device on the same account", async () => {
  for (const id of [phone, desktop]) {
    expect((await db.request("/reservation-alerts", "PUT", subscription(id))).status).toBe(200);
    expect(await (await settings(id)).json()).toMatchObject({ enabled: true });
  }

  expect((await db.request("/logout", "POST", { pushDeviceId: phone })).status).toBe(200);
  expect((await db.request("/session")).status).toBe(401);
  await db.signIn();

  expect(await (await settings(phone)).json()).toMatchObject({ enabled: false });
  expect(await (await settings(desktop)).json()).toMatchObject({ enabled: true });

  vi.setSystemTime(new Date("2026-11-11T15:00:00Z"));
  expect((await db.request("/session")).status).toBe(401);
  await db.signIn();
  expect(await (await settings(desktop)).json()).toMatchObject({ enabled: true });
});

it("does not let another account claim or disable a registered device", async () => {
  const input = subscription(phone);
  expect((await db.request("/reservation-alerts", "PUT", input, { signedIn: false })).status).toBe(
    401,
  );
  expect((await db.request("/reservation-alerts", "PUT", input)).status).toBe(200);

  await db.signIn("owner");
  expect(
    (await db.request("/reservation-alerts", "PUT", { ...input, deviceId: desktop })).status,
  ).toBe(409);
  expect((await db.request("/reservation-alerts", "PUT", input)).status).toBe(409);
  expect(await (await settings(phone)).json()).toMatchObject({ enabled: false });
  expect((await db.request("/reservation-alerts", "DELETE", { deviceId: phone })).status).toBe(200);
  await db.signIn();
  expect(await (await settings(phone)).json()).toMatchObject({ enabled: true });
});

it("cannot enable alerts with a request that finishes uploading after that session signs out", async () => {
  const cookie = await signIn(db.env);
  const headers = { cookie, origin: PORTAL_ORIGIN, "content-type": "application/json" };
  const reading = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        reading.resolve();
        await resume.promise;
        controller.enqueue(new TextEncoder().encode(JSON.stringify(subscription(phone))));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const registration = app.request(
    new Request("http://localhost/reservation-alerts", {
      method: "PUT",
      headers,
      body,
      duplex: "half",
    } as RequestInit),
    undefined,
    db.env,
  );
  try {
    await reading.promise;
    expect(
      (
        await app.request(
          "/logout",
          { method: "POST", headers, body: JSON.stringify({ pushDeviceId: phone }) },
          db.env,
        )
      ).status,
    ).toBe(200);
  } finally {
    resume.resolve();
  }
  expect((await registration).status).toBe(401);
  expect(await (await settings(phone)).json()).toMatchObject({ enabled: false });
});
