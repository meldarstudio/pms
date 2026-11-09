import type { Lang } from "@/i18n/utils";

export const CULQI_CHECKOUT_SCRIPT = "https://js.culqi.com/checkout-js";
export const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type CulqiInstance = {
  token?: { id: string };
  error?: unknown;
  culqi: () => void;
  open: () => void;
  close: () => void;
};

type TurnstileOptions = {
  sitekey: string;
  action: string;
  language: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type Turnstile = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  reset: (widget: string) => void;
};

declare global {
  interface Window {
    CulqiCheckout?: new (publicKey: string, config: unknown) => CulqiInstance;
    turnstile?: Turnstile;
  }
}

const loading = new Map<string, Promise<void>>();

function loadScript(src: string) {
  const existing = loading.get(src);
  if (existing) return existing;
  const loaded = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      loading.delete(src);
      script.remove();
      reject(new Error(`could not load ${src}`));
    });
    document.head.append(script);
  });
  loading.set(src, loaded);
  return loaded;
}

export async function openCardForm(options: {
  publicKey: string;
  title: string;
  amountCents: number;
  currency: string;
  email: string;
  lang: Lang;
}): Promise<string | null> {
  await loadScript(CULQI_CHECKOUT_SCRIPT);
  const Checkout = window.CulqiCheckout;
  if (!Checkout) throw new Error("Culqi Checkout is unavailable");
  return new Promise((resolve) => {
    const checkout = new Checkout(options.publicKey, {
      settings: {
        title: options.title,
        currency: options.currency,
        amount: options.amountCents,
      },
      client: { email: options.email },
      options: {
        lang: options.lang,
        installments: false,
        modal: true,
        paymentMethods: {
          tarjeta: true,
          yape: false,
          billetera: false,
          bancaMovil: false,
          agente: false,
          cuotealo: false,
        },
        paymentMethodsSort: ["tarjeta"],
      },
    });
    checkout.culqi = () => {
      const token = checkout.token?.id ?? null;
      checkout.close();
      resolve(token);
    };
    checkout.open();
  });
}

export type SecurityCheck = { token: () => string; reset: () => void };

export async function renderSecurityCheck(
  container: HTMLElement,
  options: { siteKey: string; lang: Lang; onError: () => void },
): Promise<SecurityCheck> {
  await loadScript(TURNSTILE_SCRIPT);
  const turnstile = window.turnstile;
  if (!turnstile) throw new Error("Turnstile is unavailable");
  let current = "";
  const widget = turnstile.render(container, {
    sitekey: options.siteKey,
    action: "payment",
    language: options.lang,
    callback: (token) => {
      current = token;
    },
    "expired-callback": () => {
      current = "";
    },
    "error-callback": () => {
      current = "";
      options.onError();
    },
  });
  return {
    token: () => current,
    reset: () => {
      current = "";
      turnstile.reset(widget);
    },
  };
}
