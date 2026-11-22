import { Deferred, Effect } from "effect";
import { copyText } from "@/lib/clipboard";
import { startIsland } from "@/lib/island";
import { PmsClient } from "@/lib/pms-client";
import { acceptQuote, readCheckout, refreshQuote, startCheckout } from "@/lib/reservation/checkout";
import type { Draft, Effect as Command, Event, FocusTarget } from "@/lib/reservation/checkout-flow";
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
  authenticateWithBank,
  deviceFingerprint,
  openCardForm,
  renderSecurityCheck,
  type BankOutcome,
  type SecurityCheck,
} from "@/lib/reservation/providers";
import { readCheckoutAccess, summaryLink } from "@/lib/reservation/summary";

export const PAYMENT_POLL_MS = 5_000;
export const SECURITY_CHECK_WAIT_MS = 10_000;

const untilDispatchReturns = Effect.yieldNow;

export type CardPayments = { culqiPublicKey: string; turnstileSiteKey: string; title: string };

export type CheckoutRunnerOptions = {
  apiBase: string;
  summaryHref: string;
  payments: CardPayments | null;
  dispatch: (event: Event) => void;
  securityContainer: () => HTMLElement | null;
  focus: (target: FocusTarget) => void;
  returnToRoom: (room: number) => void;
};

export type CheckoutRunner = {
  run: (commands: readonly Command[]) => void;
  dispose: () => void;
};

export function readDraft(key: string): Draft {
  return {
    contact: storedContact(),
    checkout: storedCheckout(key),
    card: key ? storedCard(key) : null,
  };
}

const bankEvent = (outcome: BankOutcome): Event =>
  outcome.kind === "parameters"
    ? { type: "bankParameters", parameters: outcome.parameters }
    : { type: outcome.kind === "refused" ? "bankRefused" : "bankIncomplete" };

export function createCheckoutRunner(options: CheckoutRunnerOptions): CheckoutRunner {
  const { summaryHref, payments } = options;
  let disposed = false;
  const dispatch = (event: Event) => {
    if (!disposed) options.dispatch(event);
  };
  const island = startIsland(PmsClient.layer(options.apiBase));
  const poll = island.latest();
  const bank = island.latest();
  const securityWidget = island.latest();
  let securityCheck: Deferred.Deferred<SecurityCheck | null> | null = null;
  let security: SecurityCheck | null = null;

  const send = (event: Event) => Effect.sync(() => dispatch(event));
  const now = () => Date.now();

  function startSecurityCheck(command: Extract<Command, { type: "startSecurityCheck" }>) {
    const container = options.securityContainer();
    if (!payments || !container) return;
    const ready = Deferred.makeUnsafe<SecurityCheck | null>();
    securityCheck = ready;
    securityWidget.replace(
      renderSecurityCheck(container, {
        siteKey: payments.turnstileSiteKey,
        lang: command.lang,
        onPassed: () => dispatch({ type: "securityCheckPassed" }),
        onError: () => dispatch({ type: "securityCheckErrored" }),
      }).pipe(
        Effect.tap((check) => {
          security = check;
          return Deferred.succeed(ready, check);
        }),
        Effect.andThen(Effect.never),
        Effect.catch(() =>
          Effect.sync(() => {
            if (securityCheck === ready) securityCheck = null;
            dispatch({ type: "securityCheckFailed" });
          }),
        ),
        Effect.ensuring(Deferred.succeed(ready, null)),
        Effect.scoped,
      ),
    );
  }

  function execute(command: Command): Effect.Effect<void, never, PmsClient> | null {
    switch (command.type) {
      case "readCheckout":
        return Effect.flatMap(readCheckout(command.token), (outcome) =>
          send({ type: "checkoutRead", after: command.after, outcome, now: now() }),
        );
      case "startCheckout":
        return Effect.flatMap(startCheckout(command.selection, command.lang), (outcome) =>
          send({ type: "checkoutStarted", after: command.after, outcome, now: now() }),
        );
      case "refreshQuote":
        return Effect.flatMap(refreshQuote(command.token), (outcome) =>
          send({ type: "quoteRefreshed", after: command.after, outcome, now: now() }),
        );
      case "acceptQuote":
        return Effect.flatMap(acceptQuote(command.token, command.acceptance), (outcome) =>
          send({ type: "quoteAccepted", outcome, now: now() }),
        );
      case "readPayment":
        return Effect.flatMap(readPayment(command.token), (outcome) =>
          send({ type: "paymentRead", after: command.after, outcome, now: now() }),
        );
      case "startPayment":
        return Effect.flatMap(startPayment(command.token, command.payment), (outcome) =>
          send({ type: "paymentStarted", outcome, now: now() }),
        );
      case "continuePayment":
        return Effect.flatMap(continuePayment(command.token, command.authentication), (outcome) =>
          send({ type: "paymentContinued", outcome }),
        );
      case "reportAuthenticationFailure":
        return Effect.flatMap(
          reportAuthenticationFailure(command.token, command.attemptId),
          (outcome) => send({ type: "authenticationFailureReported", outcome }),
        );
      case "readCheckoutAccess":
        return Effect.flatMap(readCheckoutAccess(command.token), (access) =>
          send({ type: "accessRead", request: command.request, access }),
        );
      case "startSecurityCheck":
        startSecurityCheck(command);
        return null;
      case "readSecurityToken": {
        const rendering = securityCheck;
        return Effect.gen(function* () {
          yield* untilDispatchReturns;
          const check = rendering ? yield* Deferred.await(rendering) : null;
          const token = check ? yield* check.token(SECURITY_CHECK_WAIT_MS) : "";
          dispatch({ type: "securityTokenRead", token });
        });
      }
      case "resetSecurityCheck":
        return security?.reset ?? null;
      case "openCardForm":
        if (!payments) return null;
        return openCardForm({
          publicKey: payments.culqiPublicKey,
          title: payments.title,
          amountCents: command.amountCents,
          currency: command.currency,
          email: command.email,
          lang: command.lang,
          yape: command.yape,
        }).pipe(
          Effect.matchEffect({
            onFailure: () => send({ type: "cardFormFailed" }),
            onSuccess: (sourceId) => send({ type: "cardFormResolved", sourceId }),
          }),
        );
      case "deviceFingerprint":
        if (!payments) return null;
        return Effect.flatMap(
          deviceFingerprint({
            publicKey: payments.culqiPublicKey,
            amountCents: command.amountCents,
            currency: command.currency,
            email: command.email,
          }),
          (fingerprint) => send({ type: "fingerprintRead", fingerprint }),
        );
      case "openBank":
        if (!payments) return null;
        bank.replace(
          authenticateWithBank({
            publicKey: payments.culqiPublicKey,
            amountCents: command.amountCents,
            currency: command.currency,
            email: command.email,
            sourceId: command.sourceId,
          }).pipe(
            Effect.orElseSucceed((): BankOutcome => ({ kind: "incomplete" })),
            Effect.flatMap((outcome) => send(bankEvent(outcome))),
          ),
        );
        return null;
      case "storeCheckout":
        storeCheckout(command.key, command.checkout);
        return null;
      case "storeCard":
        storeCard(command.key, command.card);
        return null;
      case "clearCardSource":
        clearCardSource(command.key);
        return null;
      case "storeContact":
        storeContact(command.contact);
        return null;
      case "clearContact":
        clearContact();
        return null;
      case "schedulePoll":
        poll.replace(Effect.andThen(Effect.sleep(PAYMENT_POLL_MS), send({ type: "pollElapsed" })));
        return null;
      case "cancelPoll":
        poll.cancel();
        return null;
      case "copyAccessLink":
        return Effect.flatMap(copyText(summaryLink(summaryHref, command.token)), (copied) =>
          send({ type: "accessCopied", copied }),
        );
      case "returnToRoom":
        options.returnToRoom(command.room);
        return null;
      case "focus":
        options.focus(command.target);
        return null;
    }
  }

  return {
    run(commands) {
      for (const command of commands) {
        const effect = execute(command);
        if (effect) island.fork(effect);
      }
    },
    dispose() {
      disposed = true;
      island.dispose();
    },
  };
}
