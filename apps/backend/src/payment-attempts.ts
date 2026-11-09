import type { PaymentAttemptCreate, PaymentAuthentication } from "@pms/shared";
import { and, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  culqiForEnv,
  isSuccessfulCharge,
  type ChargeResult,
  type Culqi,
  type CulqiCharge,
} from "./culqi";
import type { Db } from "./db";
import {
  checkoutAcceptances,
  guests,
  operationControls,
  paymentAttempts,
  quotes,
  reservations,
  type AttemptStatus,
} from "./db/schema";
import type { Env } from "./env";
import { HttpError, PAYMENT_PENDING, rethrowConflict } from "./http";
import { quoteBill } from "./lib/reservation-bill";
import { inventoryStatuses } from "./lib/statuses";
import { propertyCalendar } from "./property-calendar";
import { quoteExpired, saveQuote } from "./quotes";
import { acceptPhone } from "./rules";

export type Attempt = typeof paymentAttempts.$inferSelect;
type Quote = typeof quotes.$inferSelect;

export type PublicCheckoutProvenance = {
  checkoutId: string;
  acceptanceId: string;
  language: NonNullable<Attempt["language"]>;
};

export const PAYMENT_NOT_ADMITTED = "payment was not admitted";

export type PaymentContext = {
  culqi: Culqi;
  currency: string;
  timeZone: string;
  later?: (lookup: () => Promise<unknown>) => void;
};

const MINUTE = 60_000;
const DELAYED_AFTER = 2 * MINUTE;
const LOOKUP_FOR = 48 * 60 * MINUTE;
const LOOKUP_SLACK = MINUTE;
export const LOOKUP_DELAY_MS = 10_000;

const PAID: AttemptStatus[] = ["succeeded", "saved"];
const OPEN: AttemptStatus[] = ["unknown", "review", ...PAID];

export const paymentDelayed = (attempt: Pick<Attempt, "status" | "calledAt">) =>
  attempt.status === "unknown" && Date.now() - Date.parse(attempt.calledAt) > DELAYED_AFTER;

export async function latestCheckoutAttempt(
  db: Db,
  checkoutId: string,
  options: { open?: boolean } = {},
) {
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.checkoutId, checkoutId),
        options.open ? inArray(paymentAttempts.status, OPEN) : undefined,
      ),
    )
    .orderBy(desc(paymentAttempts.createdAt), desc(sql`rowid`))
    .limit(1);
  return attempt ?? null;
}

export async function startPaymentAttempt(
  db: Db,
  input: PaymentAttemptCreate,
  context: PaymentContext,
  publicCheckout?: PublicCheckoutProvenance,
) {
  const quote = await findQuote(db, input.quoteId);
  const now = new Date();
  requireValid(quote, now);
  requireCulqi(context);
  const phone = acceptPhone(input.guest.phone);
  const previous = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.quoteId, quote.id));
  if (previous.some((attempt) => PAID.includes(attempt.status)))
    throw new HttpError(409, "quote is already paid");
  if (
    previous.some(
      (attempt) => attempt.status === "unknown" || (publicCheckout && attempt.status === "review"),
    )
  )
    throw new HttpError(409, PAYMENT_PENDING);
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
    guest: { ...input.guest, phone },
    sourceId: input.sourceId,
    deviceFingerprint: input.deviceFingerprint ?? null,
    status: "unknown",
    createdAt: now.toISOString(),
    calledAt: now.toISOString(),
    failureCode: null,
    failureMessage: null,
    culqiChargeId: null,
    reservationId: null,
    checkoutId: publicCheckout?.checkoutId ?? null,
    acceptanceId: publicCheckout?.acceptanceId ?? null,
    language: publicCheckout?.language ?? null,
    confirmationEmailEligible: publicCheckout !== undefined,
  };
  try {
    if (publicCheckout) await insertAdmittedAttempt(db, attempt, publicCheckout);
    else await db.insert(paymentAttempts).values(attempt);
  } catch (error) {
    rethrowConflict(error);
  }
  return record(db, attempt, await context.culqi.createCharge(chargeRequest(attempt)), context);
}

async function insertAdmittedAttempt(
  db: Db,
  attempt: Attempt,
  { checkoutId, acceptanceId, language }: PublicCheckoutProvenance,
) {
  await db.run(sql`INSERT INTO ${paymentAttempts} (id, quote_id, amount_cents, currency, email,
      guest, source_id, device_fingerprint, status, created_at, called_at, checkout_id,
      acceptance_id, language, confirmation_email_eligible)
    SELECT ${attempt.id}, ${attempt.quoteId}, ${attempt.amountCents}, ${attempt.currency},
      ${attempt.email}, ${JSON.stringify(attempt.guest)}, ${attempt.sourceId},
      ${attempt.deviceFingerprint}, ${attempt.status}, ${attempt.createdAt}, ${attempt.calledAt},
      ${checkoutId}, ${acceptanceId}, ${language}, 1
    WHERE EXISTS (SELECT 1 FROM ${operationControls}
        WHERE ${operationControls.id} = 1 AND ${operationControls.publicPaymentsAdmitted} = 1)
      AND ${attempt.quoteId} = (SELECT ${quotes.id} FROM ${quotes}
        WHERE ${quotes.checkoutId} = ${checkoutId}
        ORDER BY ${quotes.createdAt} DESC, ${quotes}.rowid DESC LIMIT 1)
      AND ${acceptanceId} = (SELECT ${checkoutAcceptances.id} FROM ${checkoutAcceptances}
        WHERE ${checkoutAcceptances.checkoutId} = ${checkoutId}
        ORDER BY ${checkoutAcceptances.acceptedAt} DESC, ${checkoutAcceptances}.rowid DESC LIMIT 1)`);
  const [inserted] = await db
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attempt.id));
  if (!inserted) throw new HttpError(409, PAYMENT_NOT_ADMITTED);
}

export async function authenticatePaymentAttempt(
  db: Db,
  attemptId: string,
  authentication: PaymentAuthentication,
  context: PaymentContext,
) {
  await expireReviews(db, attemptId);
  const attempt = await findAttempt(db, attemptId);
  if (attempt.status !== "review")
    throw new HttpError(409, "payment is not waiting for authentication");
  const quote = await findQuote(db, attempt.quoteId);
  const now = new Date();
  requireValid(quote, now);
  requireCulqi(context);
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
  return record(db, claimed, result, context);
}

export async function paymentAttemptStatus(db: Db, attemptId: string, context: PaymentContext) {
  return present(db, await refreshPaymentAttempt(db, attemptId, context));
}

export async function refreshPaymentAttempt(db: Db, attemptId: string, context: PaymentContext) {
  await expireReviews(db, attemptId);
  const attempt = await findAttempt(db, attemptId);
  try {
    return await resolve(db, attempt, context);
  } catch (error) {
    console.error("payment attempt", attempt.id, error);
    return findAttempt(db, attemptId);
  }
}

export async function reconcilePaymentAttempts(db: Db, context: PaymentContext) {
  await expireReviews(db);
  if (!context.culqi.configured) return;
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
    .orderBy(paymentAttempts.calledAt)
    .limit(50);
  for (const attempt of pending) {
    try {
      await resolve(db, attempt, context);
    } catch (error) {
      console.error("payment attempt", attempt.id, error);
    }
  }
}

async function expireReviews(db: Db, attemptId?: string) {
  await db
    .update(paymentAttempts)
    .set({
      status: "failed",
      failureCode: "authentication_expired",
      failureMessage: "quote has expired",
    })
    .where(
      and(
        eq(paymentAttempts.status, "review"),
        isNull(paymentAttempts.checkoutId),
        attemptId ? eq(paymentAttempts.id, attemptId) : undefined,
        inArray(
          paymentAttempts.quoteId,
          db
            .select({ id: quotes.id })
            .from(quotes)
            .where(lte(quotes.expiresAt, new Date().toISOString())),
        ),
      ),
    );
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
  const found = listed.find(
    (listedCharge) =>
      listedCharge.metadata?.attempt_id === attempt.id && matches(attempt, listedCharge),
  );
  return found ? succeed(db, attempt, found, context) : attempt;
}

async function record(db: Db, attempt: Attempt, result: ChargeResult, context: PaymentContext) {
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
    console.error("payment attempt save", current.id, error);
    return current;
  }
}

async function fulfill(db: Db, attempt: Attempt, context: PaymentContext): Promise<Attempt> {
  const quote = await findQuote(db, attempt.quoteId);
  const { today } = propertyCalendar(context.timeZone);
  const payment = {
    amountCents: attempt.amountCents,
    method: "card",
    reference: attempt.culqiChargeId,
    paymentDate: propertyCalendar(context.timeZone, new Date(attempt.calledAt)).today,
    culqiChargeId: attempt.culqiChargeId,
  };
  const unfulfilled = quote.checkIn < today || (await rebooked(db, quote, attempt.email));
  const saved = { payment, publicCheckoutId: attempt.checkoutId };
  let reservationId: string;
  try {
    reservationId = await saveQuote(db, quote.id, attempt.guest, {
      status: unfulfilled ? "unfulfilled" : "confirmed",
      ...saved,
    });
  } catch (error) {
    if (!(error instanceof HttpError && error.message === "no availability")) throw error;
    reservationId = await saveQuote(db, quote.id, attempt.guest, {
      status: "unfulfilled",
      ...saved,
    });
  }
  const [recorded] = await db
    .update(paymentAttempts)
    .set({ status: "saved", reservationId })
    .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, "succeeded")))
    .returning();
  return recorded ?? findAttempt(db, attempt.id);
}

async function rebooked(db: Db, quote: Quote, email: string) {
  const [row] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(
      and(
        eq(reservations.source, "online"),
        ne(reservations.quoteId, quote.id),
        inArray(reservations.status, inventoryStatuses),
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
  fullName: attempt.guest.fullName,
  phone: attempt.guest.phone,
  deviceFingerprint: attempt.deviceFingerprint,
});

function requireCulqi(context: PaymentContext) {
  if (!context.culqi.configured) throw new HttpError(503, "Culqi is not configured");
}

function requireValid(quote: Quote, now: Date) {
  if (quoteExpired(quote, now)) throw new HttpError(400, "quote has expired");
}

function initialPaymentCents(quote: Quote) {
  return quoteBill(quote).requiredInitialPaymentCents;
}

async function findQuote(db: Db, id: string) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) throw new HttpError(404, "quote not found");
  return quote;
}

export async function findAttempt(db: Db, id: string) {
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
    delayed: paymentDelayed(attempt),
    failure:
      attempt.status === "failed"
        ? { code: attempt.failureCode, message: attempt.failureMessage }
        : null,
    reservation: reservation ?? null,
  };
}

export const lookUpLater =
  (waitUntil: (task: Promise<unknown>) => void) => (lookup: () => Promise<unknown>) =>
    waitUntil(
      new Promise((done) => setTimeout(done, LOOKUP_DELAY_MS))
        .then(lookup)
        .catch((error: unknown) => console.error("payment attempt lookup", error)),
    );

export const paymentContext = (
  env: Env["Bindings"],
  waitUntil?: (task: Promise<unknown>) => void,
): PaymentContext => ({
  culqi: culqiForEnv(env),
  currency: env.CURRENCY || "PEN",
  timeZone: env.PROPERTY_TIME_ZONE,
  later: waitUntil && lookUpLater(waitUntil),
});
