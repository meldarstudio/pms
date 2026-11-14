import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { FAKE_PAYMENT_SERVICES_URL, LOCAL_API_URL } from "./local-api";

const fakeCulqiCheckout = `
window.culqiConfigs ??= [];
window.culqiCards ??= [];
window.CulqiCheckout = class {
  constructor(publicKey, config) {
    window.culqiConfigs.push({ publicKey, ...config });
    sessionStorage.setItem("test.culqiConfigs", JSON.stringify(window.culqiConfigs));
  }
  open() {
    const id = window.culqiCards.length
      ? window.culqiCards.shift()
      : "tkn_test_" + crypto.randomUUID();
    if (id === null) {
      setTimeout(() => this.closeCheckout?.(), 0);
      return;
    }
    setTimeout(() => {
      this.token = { id };
      this.culqi();
    }, 0);
  }
  close() {}
};
`;

const fakeTurnstile = `
window.turnstile = {
  widgets: [],
  render(container, options) {
    const note = document.createElement("p");
    note.textContent = "Security check complete";
    container.append(note);
    this.widgets.push(options);
    setTimeout(() => options.callback(options.action === "complaint" ? "complaint-turnstile-pass" : "turnstile-pass"), 0);
    return String(this.widgets.length - 1);
  },
  reset(widget) {
    const options = this.widgets[Number(widget)];
    setTimeout(() => options.callback(options.action === "complaint" ? "complaint-turnstile-pass" : "turnstile-pass"), 0);
  },
  remove(widget) {},
};
`;

const fakeHeldTurnstile = `
window.turnstile = {
  render(container, options) {
    window.passSecurityCheck = () => options.callback(options.action === "complaint" ? "complaint-turnstile-pass" : "turnstile-pass");
    window.expireSecurityCheck = () => options["expired-callback"]();
    window.failSecurityCheck = () => options["error-callback"]();
    return "0";
  },
  reset() {},
  remove() {},
};
`;

const fakeCulqi3DS = `
window.culqi3DS ??= {
  devices: [],
  authentications: [],
  parameters: null,
  error: null,
  closes: false,
};
window.culqi3DS.devices ??= [];
window.culqi3DS.authentications ??= [];
window.Culqi3DS = {
  publicKey: "",
  settings: null,
  options: {},
  reset() {},
  async generateDevice() {
    window.culqi3DS.devices.push(this.settings);
    return "device-test";
  },
  initAuthentication(token) {
    window.culqi3DS.authentications.push(token);
    sessionStorage.setItem(
      "test.culqi3DS.authentications",
      JSON.stringify(window.culqi3DS.authentications),
    );
    const { parameters, error, closes } = window.culqi3DS;
    setTimeout(() => {
      if (parameters) window.postMessage({ parameters3DS: parameters }, window.location.origin);
      else if (error) window.postMessage({ error }, window.location.origin);
      else if (closes) this.options.closeModalAction?.();
    }, 0);
  },
};
`;

export async function stubPaymentScripts(page: Page) {
  await page.route("https://js.culqi.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeCulqiCheckout }),
  );
  await page.route("https://3ds.culqi.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeCulqi3DS }),
  );
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeTurnstile }),
  );
}

export async function holdSecurityCheck(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeHeldTurnstile }),
  );
}

export const passSecurityCheck = (page: Page) =>
  page.evaluate(() => (window as unknown as { passSecurityCheck: () => void }).passSecurityCheck());

let sourceIps = 0;

export async function useOwnSourceIp(page: Page, workerIndex: number) {
  const address = `10.1.${workerIndex % 250}.${(sourceIps += 1) % 250}`;
  await page.route(`${LOCAL_API_URL}/public/**`, (route) =>
    route.fallback({ headers: { ...route.request().headers(), "cf-connecting-ip": address } }),
  );
}

export async function nextCulqiCharge(request: APIRequestContext, outcome: "timeout" | "lose") {
  const response = await request.post(`${FAKE_PAYMENT_SERVICES_URL}/__culqi/next`, {
    data: { call: "POST /charges", outcome },
  });
  if (response.status() !== 204) throw new Error("could not script the fake Culqi");
}

export async function closeCardFormWithoutPaying(page: Page, payButton: Locator) {
  await page.evaluate(() => {
    (window as unknown as { culqiCards: (string | null)[] }).culqiCards = [null];
  });
  await payButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { culqiCards: (string | null)[] }).culqiCards.length,
      ),
    )
    .toBe(0);
  await expect(payButton).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { culqiConfigs: unknown[] }).culqiConfigs = [];
    sessionStorage.removeItem("test.culqiConfigs");
  });
}

export async function recordedCulqi(page: Page) {
  return page.evaluate(() => ({
    configs: JSON.parse(sessionStorage.getItem("test.culqiConfigs") ?? "[]") as unknown[],
    authentications: JSON.parse(
      sessionStorage.getItem("test.culqi3DS.authentications") ?? "[]",
    ) as string[],
  }));
}
