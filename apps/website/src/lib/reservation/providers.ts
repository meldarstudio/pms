import type { Lang } from "@/i18n/utils";

export const CULQI_CHECKOUT_SCRIPT = "https://js.culqi.com/checkout-js";
export const CULQI_3DS_SCRIPT = "https://3ds.culqi.com";
export const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type CulqiInstance = {
  token?: { id: string };
  error?: unknown;
  culqi: () => void;
  closeCheckout: () => void;
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

export type AuthenticationParameters = {
  eci: string;
  xid?: string;
  cavv: string;
  protocolVersion: string;
  directoryServerTransactionId: string;
};

type BankModalStyle = {
  btnColor: string;
  btnTextColor: string;
};

type Culqi3DS = {
  publicKey: string;
  settings: {
    charge: { totalAmount: number; returnUrl: string; currency?: string };
    card: { email: string };
  };
  options?: { closeModalAction?: () => void; style?: Partial<BankModalStyle> };
  generateDevice: () => Promise<string | null>;
  initAuthentication: (tokenId: string) => Promise<void>;
  reset: () => void;
};

declare global {
  interface Window {
    CulqiCheckout?: new (publicKey: string, config: unknown) => CulqiInstance;
    Culqi3DS?: Culqi3DS;
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

const cardAccent = "#f27b02";
const cardAccentInk = "#37180a";
const cardLink = "#813915";
const cardFocus = "#a94d19";
const cardText = "#1c1917";
const cardBorder = "#a8a29e";

const cardAppearance = {
  theme: "default",
  hiddenBanner: false,
  hiddenToolBarAmount: false,
  hiddenEmail: false,
  menuType: "default",
  defaultStyle: {
    buttonBackground: cardAccent,
    menuColor: cardLink,
    linksColor: cardLink,
    buttonTextColor: cardAccentInk,
    priceColor: cardText,
  },
  variables: {
    fontFamily: '"Source Sans 3", sans-serif',
    fontWeightNormal: "400",
    borderRadius: "0",
    colorBackground: "#ffffff",
    colorPrimary: cardAccent,
    colorPrimaryText: cardAccentInk,
    colorText: cardText,
    colorTextSecondary: "#57534e",
    colorTextPlaceholder: "#78716c",
    colorIconTab: cardText,
  },
  rules: {
    ".Culqi-Main-Container": {
      background: "#ffffff",
      color: cardText,
      fontFamily: "var(--fontFamily)",
    },
    ".Culqi-Toolbar-Price": {
      color: cardText,
    },
    ".Culqi-Label": {
      color: "#292524",
    },
    ".Culqi-Input": {
      border: `1px solid ${cardBorder}`,
      borderRadius: "0",
      color: cardText,
    },
    ".Culqi-Input:focus": {
      border: `2px solid ${cardFocus}`,
    },
    ".Culqi-Text-Link": {
      color: cardLink,
    },
    ".Culqi-Button": {
      background: cardAccent,
      color: cardAccentInk,
      borderRadius: "0",
      fontWeight: "600",
    },
    ".Culqi-Button:disabled": {
      background: "#f6d3a8",
      color: cardAccentInk,
      opacity: "1",
    },
  },
} as const;

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
      appearance: {
        ...cardAppearance,
        buttonCardPayText: options.lang === "en" ? "Pay" : "Pagar",
      },
    });
    checkout.culqi = () => {
      const token = checkout.token?.id ?? null;
      checkout.close();
      resolve(token);
    };
    checkout.closeCheckout = () => resolve(null);
    checkout.open();
  });
}

type BankCharge = {
  publicKey: string;
  amountCents: number;
  currency: string;
  email: string;
};

const bankModalStyle: BankModalStyle = {
  btnColor: "#f27b02",
  btnTextColor: "#37180a",
};

function configureBank(culqi3DS: Culqi3DS, options: BankCharge) {
  culqi3DS.publicKey = options.publicKey;
  culqi3DS.settings = {
    charge: {
      totalAmount: options.amountCents,
      returnUrl: window.location.origin,
      currency: options.currency,
    },
    card: { email: options.email },
  };
}

async function culqi3DSLibrary() {
  await loadScript(CULQI_3DS_SCRIPT);
  return window.Culqi3DS ?? null;
}

export async function deviceFingerprint(options: BankCharge): Promise<string | null> {
  try {
    const culqi3DS = await culqi3DSLibrary();
    if (!culqi3DS) return null;
    culqi3DS.reset();
    configureBank(culqi3DS, options);
    const id = (await culqi3DS.generateDevice())?.trim() ?? "";
    return id.length > 0 && id.length <= 200 ? id : null;
  } catch {
    return null;
  }
}

type BankHandler = {
  onParameters: (parameters: AuthenticationParameters) => void;
  onIncomplete: () => void;
};

let bankListening = false;
let bankHandler: BankHandler | null = null;

function authenticationParameters(value: unknown): AuthenticationParameters | null {
  if (typeof value !== "object" || value === null) return null;
  const fields = value as Record<string, unknown>;
  const text = (key: string) => (typeof fields[key] === "string" ? fields[key] : "");
  const eci = text("eci");
  const cavv = text("cavv");
  const protocolVersion = text("protocolVersion");
  const directoryServerTransactionId = text("directoryServerTransactionId");
  if (!eci || !cavv || !protocolVersion || !directoryServerTransactionId) return null;
  const xid = text("xid");
  return { eci, cavv, protocolVersion, directoryServerTransactionId, ...(xid ? { xid } : {}) };
}

function ensureBankListener() {
  if (bankListening) return;
  bankListening = true;
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || !bankHandler) return;
    const data = event.data as { parameters3DS?: unknown; error?: unknown } | null;
    if (!data || typeof data !== "object") return;
    const parameters = authenticationParameters(data.parameters3DS);
    if (parameters) {
      const handler = bankHandler;
      bankHandler = null;
      handler.onParameters(parameters);
      return;
    }
    if (typeof data.error === "string" && data.error) {
      const handler = bankHandler;
      bankHandler = null;
      handler.onIncomplete();
    }
  });
}

function bankClosed() {
  const handler = bankHandler;
  bankHandler = null;
  handler?.onIncomplete();
}

export async function openBankAuthentication(
  options: BankCharge & { sourceId: string } & BankHandler,
) {
  const culqi3DS = await culqi3DSLibrary();
  if (!culqi3DS) throw new Error("Culqi3DS is unavailable");
  culqi3DS.reset();
  configureBank(culqi3DS, options);
  ensureBankListener();
  bankHandler = { onParameters: options.onParameters, onIncomplete: options.onIncomplete };
  culqi3DS.options = { closeModalAction: bankClosed, style: bankModalStyle };
  try {
    await culqi3DS.initAuthentication(options.sourceId);
  } catch {
    if (bankHandler) bankClosed();
  }
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
