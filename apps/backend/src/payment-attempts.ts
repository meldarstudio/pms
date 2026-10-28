import type { PaymentAttemptCreate, PaymentAuthentication } from "@pms/shared";
import { and, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import {
  culqiClient,
  isSuccessfulCharge,
  type ChargeResult,
  type Culqi,
  type CulqiCharge,
} from "./culqi";
import type { Db } from "./db";
import { guests, paymentAttempts, quotes, reservations } from "./db/schema";
import type { Env } from "./env";
import { HttpError } from "./http";
import { reservationBill } from "./lib/workflow-billing";
import { propertyCalendar } from "./property-calendar";
import { saveQuote } from "./quotes";

type Attempt = typeof paymentAttempts.$inferSelect;
type Quote = typeof quotes.$inferSelect;

export type PaymentContext = {
  culqi: Culqi;
  currency: string;
  timeZone: string;
  /** Run `lookup` about 10 seconds later, after a charge response was lost. */
  later?: (lookup: () => Promise<unknown>) => void;
};

const MINUTE = 60_000;
/** After this the guest is told the outcome will arrive by email. */
const DELAYED_AFTER = 2 * MINUTE;
/** Unknown attempts are looked up for this long, then left for staff. */
const LOOKUP_FOR = 48 * 60 * MINUTE;
/** Culqi's clock may run slightly behind ours. */
const LOOKUP_SLACK = MINUTE;
export const LOOKUP_DELAY_MS = 10_000;

const PAID = ["succeeded", "saved"];

/**
 * Charges an online guest's card for a quote's required initial payment. The attempt
 * is saved as Unknown before Culqi is called, so a lost response is resolved by
 * looking the charge up, never by charging again.
 */
export async function startPaymentAttempt(
  db: Db,
  input: PaymentAttemptCreate,
  context: PaymentContext,
) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId));
  if (!quote) throw new HttpError(404, "quote not found");
  const now = new Date();
  requireValid(quote, now);
  const previous = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.quoteId, quote.id));
  if (previous.some((attempt) => PAID.includes(attempt.status)))
    throw new HttpError(409, "quote is already paid");
  if (previous.some((attempt) => attempt.status === "unknown"))
    throw new HttpError(409, "a payment for this quote is still being confirmed");
  // A new card replaces one the guest did not authenticate.
  await db
    .update(paymentAttempts)
    .set({ status: "failed", failureCode: "superseded" })
    .where(and(eq(paymentAttempts.quoteId, quote.id), eq(paymentAttempts.status, "review")));

  const attempt: Attempt = {
    id: crypto.randomUUID(),
    quoteId: quote.id,
    amountCents: initialPaymentCents(quote),
    currency: context.currency,
    email: input.guest.email,
    guest: input.guest,
    sourceId: input.sourceId,
    deviceFingerprint: input.deviceFingerprint ?? null,
    status: "unknown",
    createdAt: now.toISOString(),
    calledAt: now.toISOString(),
    failureCode: null,
    failureMessage: null,
    culqiChargeId: null,
    reservationId: null,
  };
  try {
    await db.insert(paymentAttempts).values(attempt);
  } catch (error) {
    // A concurrent start on the same quote holds the only open slot.
    if (String(error).includes("payment_attempts")) {
      throw new HttpError(409, "a payment for this quote is still being confirmed");
    }
    throw error;
  }
  return charge(db, attempt, await context.culqi.createCharge(chargeRequest(attempt)), context);
}

/** Continues an attempt Culqi sent to 3DS review, with the same token. */
export async function authenticatePaymentAttempt(
  db: Db,
  attemptId: string,
  authentication: PaymentAuthentication,
  context: PaymentContext,
) {
  const attempt = await findAttempt(db, attemptId);
  if (attempt.status !== "review")
    throw new HttpError(409, "payment is not waiting for authentication");
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, attempt.quoteId));
  const now = new Date();
  requireValid(quote!, now);
  const [claimed] = await db
    .update(paymentAttempts)
    .set({ status: "unknown", calledAt: now.toISOString() })
    .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, "review")))
    .returning();
  if (!claimed) throw new HttpError(409, "payment is not waiting for authentication");
  const result = await context.culqi.createCharge({
    ...chargeRequest(claimed),
    authentication3DS: authentication,
  });
  return charge(db, claimed, result, context);
}

/**
 * The attempt's current outcome for the guest's waiting page. Each poll looks an
 * Unknown charge up and retries saving a paid reservation.
 */
export async function paymentAttemptStatus(db: Db, attemptId: string, context: PaymentContext) {
  const attempt = await findAttempt(db, attemptId);
  try {
    return await present(db, await resolve(db, attempt, context));
  } catch (error) {
    // The guest keeps waiting; the scheduled Worker tries again.
    console.error("payment attempt", attempt.id, error);
    return present(db, await findAttempt(db, attemptId));
  }
}

/**
 * The scheduled Worker's pass: looks up each Unknown attempt younger than 48 hours
 * and retries each paid quote whose reservation is not saved yet.
 */
export async function reconcilePaymentAttempts(db: Db, context: PaymentContext) {
  const since = new Date(Date.now() - LOOKUP_FOR).toISOString();
  const pending = await db
    .select()
    .from(paymentAttempts)
    .where(
      or(
        and(eq(paymentAttempts.status, "unknown"), gt(paymentAttempts.calledAt, since)),
        eq(paymentAttempts.status, "succeeded"),
      ),
    )
    .limit(50);
  for (const attempt of pending) {
    try {
      await resolve(db, attempt, context);
    } catch (error) {
      console.error("payment attempt", attempt.id, error);
    }
  }
}

async function resolve(db: Db, attempt: Attempt, context: PaymentContext): Promise<Attempt> {
  if (attempt.status === "succeeded") return fulfill(db, attempt, context);
  if (attempt.status !== "unknown") return attempt;
  if (Date.now() - Date.parse(attempt.calledAt) > LOOKUP_FOR) return attempt;
  const listed = await context.culqi.listCharges({
    amountCents: attempt.amountCents,
    email: attempt.email,
    from: new Date(Date.parse(attempt.calledAt) - LOOKUP_SLACK),
  });
  // Culqi ignores metadata filters. A denied charge does not prove the attempt failed:
  // the call may still be running, so only a successful one resolves it.
  const found = listed.find(
    (listedCharge) =>
      listedCharge.metadata?.attempt_id === attempt.id && matches(attempt, listedCharge),
  );
  return found ? succeed(db, attempt, found, context) : attempt;
}

async function charge(db: Db, attempt: Attempt, result: ChargeResult, context: PaymentContext) {
  if (result.kind === "succeeded" && matches(attempt, result.charge))
    return present(db, await succeed(db, attempt, result.charge, context));
  if (result.kind === "review" || result.kind === "declined") {
    const [updated] = await db
      .update(paymentAttempts)
      .set(
        result.kind === "review"
          ? { status: "review" }
          : { status: "failed", failureCode: result.code, failureMessage: result.message },
      )
      .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, "unknown")))
      .returning();
    return present(db, updated ?? (await findAttempt(db, attempt.id)));
  }
  // A timeout, 5xx, 429 or unexpected reply may still have charged the card.
  context.later?.(() => resolve(db, attempt, context));
  return present(db, attempt);
}

async function succeed(db: Db, attempt: Attempt, paid: CulqiCharge, context: PaymentContext) {
  const [updated] = await db
    .update(paymentAttempts)
    .set({ status: "succeeded", culqiChargeId: paid.id })
    .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, "unknown")))
    .returning();
  const current = updated ?? (await findAttempt(db, attempt.id));
  if (current.status !== "succeeded") return current;
  try {
    return await fulfill(db, current, context);
  } catch (error) {
    // The charge is recorded on the attempt; polls and the scheduled Worker retry the save.
    console.error("payment attempt save", current.id, error);
    return current;
  }
}

/**
 * Saves the paid quote's reservation with its Culqi payment. When the stay can no
 * longer happen it is saved as Unfulfilled instead, keeping the payment as a refund due.
 */
async function fulfill(db: Db, attempt: Attempt, context: PaymentContext): Promise<Attempt> {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, attempt.quoteId));
  const { today } = propertyCalendar(context.timeZone);
  const payment = {
    amountCents: attempt.amountCents,
    method: "card",
    reference: attempt.culqiChargeId,
    paymentDate: today,
    culqiChargeId: attempt.culqiChargeId,
  };
  const unfulfilled = quote!.checkIn < today || (await rebooked(db, quote!, attempt.email));
  let reservationId: string;
  try {
    reservationId = await saveQuote(db, quote!.id, attempt.guest, {
      status: unfulfilled ? "unfulfilled" : "confirmed",
      payment,
    });
  } catch (error) {
    if (!(error instanceof HttpError && error.message === "no availability")) throw error;
    reservationId = await saveQuote(db, quote!.id, attempt.guest, {
      status: "unfulfilled",
      payment,
    });
  }
  const [saved] = await db
    .update(paymentAttempts)
    .set({ status: "saved", reservationId })
    .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, "succeeded")))
    .returning();
  return saved ?? findAttempt(db, attempt.id);
}

/** Whether the same email already holds an online stay overlapping the quote. */
async function rebooked(db: Db, quote: Quote, email: string) {
  const [row] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(
      and(
        eq(reservations.source, "online"),
        ne(reservations.quoteId, quote.id),
        inArray(reservations.status, ["confirmed", "checked_in", "checked_out"]),
        lt(reservations.checkIn, quote.checkOut),
        gt(reservations.checkOut, quote.checkIn),
        eq(sql`lower(${guests.email})`, email.toLowerCase()),
      ),
    )
    .limit(1);
  return row !== undefined;
}

const matches = (attempt: Attempt, culqiCharge: CulqiCharge) =>
  isSuccessfulCharge(culqiCharge) &&
  culqiCharge.amount === attempt.amountCents &&
  culqiCharge.currency_code === attempt.currency;

const chargeRequest = (attempt: Attempt) => ({
  attemptId: attempt.id,
  amountCents: attempt.amountCents,
  currency: attempt.currency,
  email: attempt.email,
  sourceId: attempt.sourceId,
  deviceFingerprint: attempt.deviceFingerprint,
});

function requireValid(quote: Quote, now: Date) {
  if (Date.parse(quote.expiresAt) <= now.getTime()) throw new HttpError(400, "quote has expired");
}

function initialPaymentCents(quote: Quote) {
  return reservationBill([quote], [], 0, {
    released: false,
    paymentSchedule: quote.terms.paymentSchedule,
  }).requiredInitialPaymentCents;
}

async function findAttempt(db: Db, id: string) {
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id));
  if (!attempt) throw new HttpError(404, "payment attempt not found");
  return attempt;
}

async function present(db: Db, attempt: Attempt) {
  const [reservation] = attempt.reservationId
    ? await db
        .select({ id: reservations.id, code: reservations.code, status: reservations.status })
        .from(reservations)
        .where(eq(reservations.id, attempt.reservationId))
    : [];
  return {
    id: attempt.id,
    quoteId: attempt.quoteId,
    amountCents: attempt.amountCents,
    currency: attempt.currency,
    status: attempt.status,
    // Still unknown after 2 minutes: the guest is told the outcome arrives by email.
    delayed:
      attempt.status === "unknown" && Date.now() - Date.parse(attempt.calledAt) > DELAYED_AFTER,
    failure:
      attempt.status === "failed"
        ? { code: attempt.failureCode, message: attempt.failureMessage }
        : null,
    reservation: reservation ?? null,
  };
}

/** Schedules an attempt lookup about 10 seconds later within a Worker invocation. */
export const lookUpLater =
  (waitUntil: (task: Promise<unknown>) => void) => (lookup: () => Promise<unknown>) =>
    waitUntil(
      new Promise((done) => setTimeout(done, LOOKUP_DELAY_MS))
        .then(lookup)
        .catch((error: unknown) => console.error("payment attempt lookup", error)),
    );

/** The Culqi client and property settings from Worker bindings. */
export const paymentContext = (
  env: Env["Bindings"],
  waitUntil?: (task: Promise<unknown>) => void,
): PaymentContext => ({
  culqi: culqiClient({ secretKey: env.CULQI_SECRET_KEY }),
  currency: env.CURRENCY || "PEN",
  timeZone: env.PROPERTY_TIME_ZONE,
  later: waitUntil && lookUpLater(waitUntil),
});
