import { Data, Deferred, Effect, Option, Schema, type Duration, type Scope } from "effect";
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
  size?: "compact" | "flexible";
  theme: "light";
};

type Turnstile = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  reset: (widget: string) => void;
  remove: (widget: string) => void;
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

export class ProviderUnavailable extends Data.TaggedError("ProviderUnavailable")<{
  provider: string;
}> {}

export class PaymentSourceRefused extends Data.TaggedError("PaymentSourceRefused") {}

const loading = new Map<string, Deferred.Deferred<void, ProviderUnavailable>>();

const loadScript = (src: string) =>
  Effect.suspend(() => {
    const existing = loading.get(src);
    if (existing) return Deferred.await(existing);
    const loaded = Deferred.makeUnsafe<void, ProviderUnavailable>();
    loading.set(src, loaded);
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => Deferred.doneUnsafe(loaded, Effect.void));
    script.addEventListener("error", () => {
      loading.delete(src);
      script.remove();
      Deferred.doneUnsafe(loaded, Effect.fail(new ProviderUnavailable({ provider: src })));
    });
    document.head.append(script);
    return Deferred.await(loaded);
  });

const fromWindow = <A>(provider: string, read: () => A | undefined) =>
  Effect.flatMap(Effect.sync(read), (value): Effect.Effect<A, ProviderUnavailable> =>
    value ? Effect.succeed(value) : Effect.fail(new ProviderUnavailable({ provider })),
  );

const attempt = <A>(provider: string, run: () => A) =>
  Effect.try({ try: run, catch: () => new ProviderUnavailable({ provider }) });

const cardAccent = "#f27b02";
const cardAccentInk = "#37180a";
const cardLink = "#813915";
const cardFocus = "#a94d19";
const cardText = "#1c1917";
const cardBorder = "#a8a29e";

const cardAppearance = {
  theme: "default",
  hiddenCulqiLogo: false,
  hiddenBannerContent: false,
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
    fontFamily: '"DM Sans", sans-serif',
    fontWeightNormal: "400",
    borderRadius: "0",
    colorBackground: "#ffffff",
    colorPrimary: cardAccent,
    colorPrimaryText: cardAccentInk,
    colorText: cardText,
    colorTextSecondary: "#57534e",
    colorTextPlaceholder: "#78716c",
    colorIconTab: cardText,
    colorLogo: "dark",
  },
  rules: {
    ".Culqi-Main-Container": {
      background: "#ffffff",
      color: cardText,
      fontFamily: "var(--fontFamily)",
      borderRadius: "0",
    },
    ".Culqi-ToolBanner": {
      background: "#ffffff",
      color: cardText,
      fontFamily: "var(--fontFamily)",
      borderRadius: "0",
    },
    ".Culqi-ToolBanner > .cursor-pointer > span": {
      background: cardText,
    },
    ".Culqi-Toolbar-Price": {
      color: cardText,
      fontFamily: "var(--fontFamily)",
    },
    ".Culqi-Main-Method": {
      background: "#ffffff",
      fontFamily: "var(--fontFamily)",
    },
    ".Culqi-Label": {
      color: "#292524",
      fontFamily: "var(--fontFamily)",
    },
    ".Culqi-Input": {
      border: `1px solid ${cardBorder}`,
      borderRadius: "0",
      color: cardText,
      fontFamily: "var(--fontFamily)",
    },
    ".Culqi-Input:focus": {
      border: `2px solid ${cardFocus}`,
    },
    ".Culqi-Text-Link": {
      color: cardLink,
      fontFamily: "var(--fontFamily)",
    },
    ".Culqi-Button": {
      background: cardAccent,
      color: cardAccentInk,
      borderRadius: "0",
      fontWeight: "600",
      fontFamily: "var(--fontFamily)",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    ".Culqi-Button:disabled": {
      background: "#e7e5e4",
      color: "#57534e",
      opacity: "1",
    },
  },
} as const;

export const openCardForm = Effect.fnUntraced(function* (options: {
  publicKey: string;
  title: string;
  amountCents: number;
  currency: string;
  email: string;
  lang: Lang;
  yape: boolean;
}): Effect.fn.Return<string | null, ProviderUnavailable | PaymentSourceRefused> {
  yield* loadScript(CULQI_CHECKOUT_SCRIPT);
  const Checkout = yield* fromWindow(CULQI_CHECKOUT_SCRIPT, () => window.CulqiCheckout);
  return yield* Effect.callback<string | null, ProviderUnavailable | PaymentSourceRefused>(
    (resume) => {
      try {
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
              yape: options.yape,
              billetera: false,
              bancaMovil: false,
              agente: false,
              cuotealo: false,
            },
            paymentMethodsSort: options.yape ? ["yape", "tarjeta"] : ["tarjeta"],
          },
          appearance: {
            ...cardAppearance,
            buttonCardPayText: options.lang === "en" ? "Pay" : "Pagar",
          },
        });
        checkout.culqi = () => {
          const token = checkout.token?.id ?? null;
          const refused = !token && checkout.error != null;
          checkout.close();
          resume(refused ? Effect.fail(new PaymentSourceRefused()) : Effect.succeed(token));
        };
        checkout.closeCheckout = () => resume(Effect.succeed(null));
        checkout.open();
        return Effect.ignore(attempt(CULQI_CHECKOUT_SCRIPT, () => checkout.close()));
      } catch {
        resume(Effect.fail(new ProviderUnavailable({ provider: CULQI_CHECKOUT_SCRIPT })));
      }
    },
  );
});

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
  culqi3DS.reset();
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

const culqi3DSLibrary = loadScript(CULQI_3DS_SCRIPT).pipe(
  Effect.andThen(fromWindow(CULQI_3DS_SCRIPT, () => window.Culqi3DS)),
);

export const deviceFingerprint = (options: BankCharge): Effect.Effect<string | null> =>
  culqi3DSLibrary.pipe(
    Effect.tap((culqi3DS) => attempt(CULQI_3DS_SCRIPT, () => configureBank(culqi3DS, options))),
    Effect.flatMap((culqi3DS) =>
      Effect.tryPromise({
        try: () => culqi3DS.generateDevice(),
        catch: () => new ProviderUnavailable({ provider: CULQI_3DS_SCRIPT }),
      }),
    ),
    Effect.map((device) => {
      const id = device?.trim() ?? "";
      return id.length > 0 && id.length <= 200 ? id : null;
    }),
    Effect.orElseSucceed(() => null),
  );

const decodeAuthenticationParameters = Schema.decodeUnknownOption(
  Schema.Struct({
    eci: Schema.NonEmptyString,
    cavv: Schema.NonEmptyString,
    protocolVersion: Schema.NonEmptyString,
    directoryServerTransactionId: Schema.NonEmptyString,
    xid: Schema.optionalKey(Schema.Unknown),
  }),
);

const decodeBankMessage = Schema.decodeUnknownOption(
  Schema.Struct({
    parameters3DS: Schema.optionalKey(Schema.Unknown),
    error: Schema.optionalKey(Schema.Unknown),
  }),
);

const authenticationParameters = (value: unknown) =>
  Option.map(
    decodeAuthenticationParameters(value),
    ({ xid, ...required }): AuthenticationParameters =>
      typeof xid === "string" && xid ? { ...required, xid } : required,
  );

export type BankOutcome =
  | { kind: "parameters"; parameters: AuthenticationParameters }
  | { kind: "incomplete" }
  | { kind: "refused" };

export const authenticateWithBank = Effect.fnUntraced(function* (
  options: BankCharge & { sourceId: string },
): Effect.fn.Return<BankOutcome, ProviderUnavailable> {
  const culqi3DS = yield* culqi3DSLibrary;
  yield* attempt(CULQI_3DS_SCRIPT, () => configureBank(culqi3DS, options));
  return yield* Effect.callback<BankOutcome>((resume) => {
    const finish = (outcome: BankOutcome) => {
      window.removeEventListener("message", onMessage);
      resume(Effect.succeed(outcome));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = decodeBankMessage(event.data);
      if (Option.isNone(message)) return;
      const parameters = authenticationParameters(message.value.parameters3DS);
      if (Option.isSome(parameters)) finish({ kind: "parameters", parameters: parameters.value });
      else if (typeof message.value.error === "string" && message.value.error)
        finish({ kind: "refused" });
    };
    window.addEventListener("message", onMessage);
    culqi3DS.options = {
      closeModalAction: () => finish({ kind: "incomplete" }),
      style: bankModalStyle,
    };
    try {
      Promise.resolve(culqi3DS.initAuthentication(options.sourceId)).catch(() =>
        finish({ kind: "incomplete" }),
      );
    } catch {
      finish({ kind: "incomplete" });
    }
    return Effect.sync(() => window.removeEventListener("message", onMessage)).pipe(
      Effect.andThen(Effect.ignore(attempt(CULQI_3DS_SCRIPT, () => culqi3DS.reset()))),
    );
  });
});

export type SecurityCheck = {
  token: (wait: Duration.Input) => Effect.Effect<string>;
  reset: Effect.Effect<void>;
};

export const renderSecurityCheck = Effect.fnUntraced(function* (
  container: HTMLElement,
  options: {
    siteKey: string;
    lang: Lang;
    action?: string;
    size?: "compact" | "flexible";
    onPassed: (token: string) => void;
    onExpired?: () => void;
    onError: () => void;
  },
): Effect.fn.Return<SecurityCheck, ProviderUnavailable, Scope.Scope> {
  yield* loadScript(TURNSTILE_SCRIPT);
  const turnstile = yield* fromWindow(TURNSTILE_SCRIPT, () => window.turnstile);
  let current = "";
  let removed = false;
  let answered = Deferred.makeUnsafe<string>();
  const answer = (token: string) => {
    current = token;
    Deferred.doneUnsafe(answered, Effect.succeed(token));
    answered = Deferred.makeUnsafe<string>();
  };
  const widget = yield* Effect.acquireRelease(
    attempt(TURNSTILE_SCRIPT, () =>
      turnstile.render(container, {
        sitekey: options.siteKey,
        action: options.action ?? "payment",
        language: options.lang,
        size: options.size,
        theme: "light",
        callback: (token) => {
          answer(token);
          options.onPassed(token);
        },
        "expired-callback": () => {
          current = "";
          options.onExpired?.();
        },
        "error-callback": () => {
          answer("");
          options.onError();
        },
      }),
    ),
    (rendered) =>
      Effect.sync(() => {
        removed = true;
        answer("");
      }).pipe(
        Effect.andThen(attempt(TURNSTILE_SCRIPT, () => turnstile.remove(rendered))),
        Effect.ignore,
      ),
  );
  return {
    token: (wait) =>
      Effect.suspend(() =>
        current || removed
          ? Effect.succeed(current)
          : Deferred.await(answered).pipe(
              Effect.timeoutOrElse({ duration: wait, orElse: () => Effect.succeed("") }),
            ),
      ),
    reset: Effect.suspend(() => {
      if (removed) return Effect.void;
      current = "";
      return Effect.ignore(attempt(TURNSTILE_SCRIPT, () => turnstile.reset(widget)));
    }),
  };
});
