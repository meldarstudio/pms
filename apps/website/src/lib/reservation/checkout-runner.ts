import { acceptQuote, readCheckout, refreshQuote, startCheckout } from "@/lib/reservation/checkout";
import type { Draft, Effect, Event, FocusTarget } from "@/lib/reservation/checkout-flow";
import {
  clearCardSource,
  clearContact,
  storeCard,
  storeCheckout,
  storeContact,
  storedCard,
  storedCheckout,
  storedContact,
} from "@/lib/reservation/draft";
import {
  continuePayment,
  readPayment,
  reportAuthenticationFailure,
  startPayment,
} from "@/lib/reservation/payment";
import {
  deviceFingerprint,
  openBankAuthentication,
  openCardForm,
  renderSecurityCheck,
  type SecurityCheck,
} from "@/lib/reservation/providers";
import { readCheckoutAccess, summaryLink } from "@/lib/reservation/summary";

export const PAYMENT_POLL_MS = 5_000;
export const SECURITY_CHECK_WAIT_MS = 10_000;

export type CardPayments = { culqiPublicKey: string; turnstileSiteKey: string; title: string };

export type CheckoutRunnerOptions = {
  apiBase: string;
  summaryHref: string;
  payments: CardPayments | null;
  dispatch: (event: Event) => void;
  securityContainer: () => HTMLElement | null;
  focus: (target: FocusTarget) => void;
};

export type CheckoutRunner = {
  run: (effects: readonly Effect[]) => void;
  dispose: () => void;
};

export function readDraft(key: string): Draft {
  return {
    contact: storedContact(),
    checkout: storedCheckout(key),
    card: key ? storedCard(key) : null,
  };
}

export function createCheckoutRunner(options: CheckoutRunnerOptions): CheckoutRunner {
  const { apiBase, summaryHref, payments } = options;
  let disposed = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let securityCheck: Promise<SecurityCheck | null> | null = null;
  let security: SecurityCheck | null = null;

  const dispatch = (event: Event) => {
    if (!disposed) options.dispatch(event);
  };

  async function execute(effect: Effect) {
    switch (effect.type) {
      case "readCheckout": {
        const outcome = await readCheckout(apiBase, effect.token);
        return dispatch({ type: "checkoutRead", after: effect.after, outcome, now: Date.now() });
      }
      case "startCheckout": {
        const outcome = await startCheckout(apiBase, effect.selection, effect.lang);
        return dispatch({ type: "checkoutStarted", after: effect.after, outcome, now: Date.now() });
      }
      case "refreshQuote": {
        const outcome = await refreshQuote(apiBase, effect.token);
        return dispatch({ type: "quoteRefreshed", after: effect.after, outcome, now: Date.now() });
      }
      case "acceptQuote": {
        const outcome = await acceptQuote(apiBase, effect.token, effect.acceptance);
        return dispatch({ type: "quoteAccepted", outcome, now: Date.now() });
      }
      case "readPayment": {
        const outcome = await readPayment(apiBase, effect.token);
        return dispatch({ type: "paymentRead", after: effect.after, outcome, now: Date.now() });
      }
      case "startPayment": {
        const outcome = await startPayment(apiBase, effect.token, effect.payment);
        return dispatch({ type: "paymentStarted", outcome, now: Date.now() });
      }
      case "continuePayment": {
        const outcome = await continuePayment(apiBase, effect.token, effect.authentication);
        return dispatch({ type: "paymentContinued", outcome });
      }
      case "reportAuthenticationFailure": {
        const outcome = await reportAuthenticationFailure(apiBase, effect.token, effect.attemptId);
        return dispatch({ type: "authenticationFailureReported", outcome });
      }
      case "readCheckoutAccess": {
        const access = await readCheckoutAccess(apiBase, effect.token);
        return dispatch({ type: "accessRead", request: effect.request, access });
      }
      case "startSecurityCheck": {
        const container = options.securityContainer();
        if (!payments || !container) return;
        securityCheck = renderSecurityCheck(container, {
          siteKey: payments.turnstileSiteKey,
          lang: effect.lang,
          onPassed: () => dispatch({ type: "securityCheckPassed" }),
          onError: () => dispatch({ type: "securityCheckErrored" }),
        })
          .then((check) => {
            security = check;
            return check;
          })
          .catch(() => {
            securityCheck = null;
            dispatch({ type: "securityCheckFailed" });
            return null;
          });
        return;
      }
      case "readSecurityToken": {
        const check = await securityCheck;
        const token = check ? await check.tokenWithin(SECURITY_CHECK_WAIT_MS) : "";
        return dispatch({ type: "securityTokenRead", token });
      }
      case "resetSecurityCheck":
        return security?.reset();
      case "openCardForm": {
        if (!payments) return;
        let sourceId: string | null;
        try {
          sourceId = await openCardForm({
            publicKey: payments.culqiPublicKey,
            title: payments.title,
            amountCents: effect.amountCents,
            currency: effect.currency,
            email: effect.email,
            lang: effect.lang,
          });
        } catch {
          return dispatch({ type: "cardFormFailed" });
        }
        return dispatch({ type: "cardFormResolved", sourceId });
      }
      case "deviceFingerprint": {
        if (!payments) return;
        const fingerprint = await deviceFingerprint({
          publicKey: payments.culqiPublicKey,
          amountCents: effect.amountCents,
          currency: effect.currency,
          email: effect.email,
        });
        return dispatch({ type: "fingerprintRead", fingerprint });
      }
      case "openBank": {
        if (!payments) return;
        try {
          await openBankAuthentication({
            publicKey: payments.culqiPublicKey,
            amountCents: effect.amountCents,
            currency: effect.currency,
            email: effect.email,
            sourceId: effect.sourceId,
            onParameters: (parameters) => dispatch({ type: "bankParameters", parameters }),
            onIncomplete: () => dispatch({ type: "bankIncomplete" }),
            onRefused: () => dispatch({ type: "bankRefused" }),
          });
        } catch {
          dispatch({ type: "bankIncomplete" });
        }
        return;
      }
      case "storeCheckout":
        return storeCheckout(effect.key, effect.checkout);
      case "storeCard":
        return storeCard(effect.key, effect.card);
      case "clearCardSource":
        return clearCardSource(effect.key);
      case "storeContact":
        return storeContact(effect.contact);
      case "clearContact":
        return clearContact();
      case "schedulePoll":
        clearTimeout(poll);
        poll = setTimeout(() => dispatch({ type: "pollElapsed" }), PAYMENT_POLL_MS);
        return;
      case "cancelPoll":
        clearTimeout(poll);
        poll = undefined;
        return;
      case "copyAccessLink": {
        let copied = false;
        try {
          await navigator.clipboard.writeText(summaryLink(summaryHref, effect.token));
          copied = true;
        } catch {
          copied = false;
        }
        return dispatch({ type: "accessCopied", copied });
      }
      case "focus":
        return options.focus(effect.target);
    }
  }

  return {
    run(effects) {
      for (const effect of effects) void execute(effect);
    },
    dispose() {
      disposed = true;
      clearTimeout(poll);
      poll = undefined;
    },
  };
}
