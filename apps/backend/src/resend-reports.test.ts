import { afterEach, expect, it, vi } from "vite-plus/test";
import { authenticateResendReport } from "./resend-reports";

const secret = "whsec_plJ3nmyCDGBKInavdOK15jsl";
const body = new TextEncoder().encode('{"event_type":"ping","data":{"success":true}}');
const headers = () =>
  new Headers({
    "svix-id": "msg_loFOjxBNrRLzqYUf",
    "svix-timestamp": "1731705121",
    "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
  });

afterEach(() => vi.useRealTimers());

it("authenticates the independent published Svix vector and a valid rotated signature", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1731705121000);
  expect(await authenticateResendReport(body, headers(), secret)).toBe("msg_loFOjxBNrRLzqYUf");
  const rotated = headers();
  rotated.set("svix-signature", `v2,ignored v1,AAAA ${rotated.get("svix-signature")}`);
  expect(await authenticateResendReport(body, rotated, secret)).toBe("msg_loFOjxBNrRLzqYUf");
});

it("fails closed on configuration, headers, exact bytes and attempt time without rejecting old event times", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1731705121000);
  for (const configuration of [undefined, "", "re_api_key", "whsec_!", "whsec_AAAA"])
    expect(await authenticateResendReport(body, headers(), configuration)).toBeNull();
  for (const name of ["svix-id", "svix-timestamp", "svix-signature"]) {
    const missing = headers();
    missing.delete(name);
    expect(await authenticateResendReport(body, missing, secret)).toBeNull();
    const changed = headers();
    changed.set(name, `${changed.get(name)}x`);
    expect(await authenticateResendReport(body, changed, secret)).toBeNull();
  }
  expect(
    await authenticateResendReport(
      new TextEncoder().encode(`${new TextDecoder().decode(body)}\n`),
      headers(),
      secret,
    ),
  ).toBeNull();
  for (const offset of [-300, 300]) {
    vi.setSystemTime((1731705121 + offset) * 1000);
    expect(await authenticateResendReport(body, headers(), secret)).not.toBeNull();
  }
  for (const offset of [-301, 301]) {
    vi.setSystemTime((1731705121 + offset) * 1000);
    expect(await authenticateResendReport(body, headers(), secret)).toBeNull();
  }
});
