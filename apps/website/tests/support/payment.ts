import type { APIRequestContext, Page } from "@playwright/test";
import { FAKE_PAYMENT_SERVICES_URL, LOCAL_API_URL } from "./local-api";

const fakeCulqiCheckout = `
window.culqiConfigs ??= [];
window.culqiCards ??= [];
window.CulqiCheckout = class {
  constructor(publicKey, config) {
    window.culqiConfigs.push({ publicKey, ...config });
  }
  open() {
    const id = window.culqiCards.shift() ?? "tkn_test_" + crypto.randomUUID();
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
    setTimeout(() => options.callback("turnstile-pass"), 0);
    return String(this.widgets.length - 1);
  },
  reset(widget) {
    const options = this.widgets[Number(widget)];
    setTimeout(() => options.callback("turnstile-pass"), 0);
  },
};
`;

export async function stubPaymentScripts(page: Page) {
  await page.route("https://js.culqi.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeCulqiCheckout }),
  );
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeTurnstile }),
  );
}

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
