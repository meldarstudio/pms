import type { CheckoutPayment, PaymentAuthentication } from "@pms/shared";
import { and, desc, eq, gt, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
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
import type { ConfirmationProvenance } from "./confirmation-intents";
import { quoteExpired, saveQuote } from "./quotes";

export type Attempt = typeof paymentAttempts.$inferSelect;
type Quote = typeof quotes.$inferSelect;

type PaymentStart = Omit<CheckoutPayment, "turnstileToken">;

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
  input: PaymentStart,
  context: PaymentContext,
  publicCheckout: PublicCheckoutProvenance,
) {
  const quote = await findQuote(db, input.quoteId);
  const now = new Date();
  requireValid(quote, now);
  requireCulqi(context);
  const contact = await acceptedContact(db, publicCheckout.acceptanceId);
  const previous = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.quoteId, quote.id));
  if (previous.some((attempt) => PAID.includes(attempt.status)))
    throw new HttpError(409, "quote is already paid");
  if (previous.some((attempt) => attempt.status === "unknown" || attempt.status === "review"))
    throw new HttpError(409, PAYMENT_PENDING);
  const attempt: Attempt = {
    id: crypto.randomUUID(),
    quoteId: quote.id,
    amountCents: initialPaymentCents(quote),
    currency: context.currency,
    email: contact.email,
    sourceId: input.sourceId,
    deviceFingerprint: input.deviceFingerprint ?? null,
    status: "unknown",
    createdAt: now.toISOString(),
    calledAt: now.toISOString(),
    failureCode: null,
    failureMessage: null,
    culqiChargeId: null,
    reservationId: null,
    checkoutId: publicCheckout.checkoutId,
    acceptanceId: publicCheckout.acceptanceId,
    language: publicCheckout.language,
    confirmationEmailEligible: true,
  };
  try {
    await insertAdmittedAttempt(db, attempt, publicCheckout);
  } catch (error) {
    rethrowConflict(error);
  }
  return record(
    db,
    attempt,
    await context.culqi.createCharge(chargeRequest(attempt, contact)),
    context,
  );
}

async function insertAdmittedAttempt(
  db: Db,
  attempt: Attempt,
  { checkoutId, acceptanceId, language }: PublicCheckoutProvenance,
) {
  await db.run(sql`INSERT INTO ${paymentAttempts} (id, quote_id, amount_cents, currency, email,
      source_id, device_fingerprint, status, created_at, called_at, checkout_id,
      acceptance_id, language, confirmation_email_eligible)
    SELECT ${attempt.id}, ${attempt.quoteId}, ${attempt.amountCents}, ${attempt.currency},
      ${attempt.email}, ${attempt.sourceId},
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

export async function continuePublicAuthentication(
  db: Db,
  attempt: Attempt,
  authentication: PaymentAuthentication,
  context: PaymentContext,
) {
  if (attempt.status !== "review") return null;
  return chargeAuthentication(db, attempt, authentication, context, new Date());
}

async function chargeAuthentication(
  db: Db,
  attempt: Attempt,
  authentication: PaymentAuthentication,
  context: PaymentContext,
  now: Date,
) {
  requireCulqi(context);
  const [claimed] = await db
    .update(paymentAttempts)
    .set({ status: "unknown", calledAt: now.toISOString() })
    .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, "review")))
    .returning();
  if (!claimed) return null;
  const result = await context.culqi.createCharge({
    ...chargeRequest(claimed, await acceptedContact(db, claimed.acceptanceId)),
    authentication3DS: authentication,
  });
  await record(db, claimed, result, context);
  return findAttempt(db, claimed.id);
}

export async function paymentAttemptStatus(db: Db, attemptId: string, context: PaymentContext) {
  return present(db, await refreshPaymentAttempt(db, attemptId, context));
}

export async function refreshPaymentAttempt(db: Db, attemptId: string, context: PaymentContext) {
  const attempt = await findAttempt(db, attemptId);
  try {
    return await resolve(db, attempt, context);
  } catch {
    console.error("payment attempt recovery failed", attempt.id);
    return findAttempt(db, attemptId);
  }
}

export async function reconcilePaymentAttempts(db: Db, context: PaymentContext) {
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
    } catch {
      console.error("payment attempt recovery failed", attempt.id);
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
  const found = chargeForAttempt(attempt, listed);
  return found ? succeed(db, attempt, found, context) : attempt;
}

function chargeForAttempt(attempt: Attempt, listed: CulqiCharge[]) {
  const labeled = listed.find(
    (listedCharge) =>
      listedCharge.metadata?.attempt_id === attempt.id && matches(attempt, listedCharge),
  );
  if (labeled) return labeled;
  const unlabeled = listed.filter(
    (listedCharge) =>
      listedCharge.metadata?.attempt_id == null &&
      listedCharge.source_id === attempt.sourceId &&
      listedWithin(attempt, listedCharge) &&
      matches(attempt, listedCharge),
  );
  return unlabeled.length === 1 ? unlabeled[0] : undefined;
}

function listedWithin(attempt: Attempt, listedCharge: CulqiCharge) {
  const created = chargeInstant(listedCharge.creation_date);
  const called = Date.parse(attempt.calledAt);
  return created >= called - LOOKUP_SLACK && created <= called + LOOKUP_SLACK;
}

function chargeInstant(creationDate: number) {
  return creationDate < 1e12 ? creationDate * 1000 : creationDate;
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
  } catch {
    console.error("payment attempt save failed", current.id);
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
  const unfulfilled = quote.checkIn < today || (await rebookedSince(db, quote, attempt));
  const { notes, ...contact } = await acceptedContact(db, attempt.acceptanceId);
  const saved = {
    payment,
    publicCheckoutId: attempt.checkoutId,
    confirmation: confirmationProvenance(attempt),
    notes,
  };
  let reservationId: string;
  try {
    reservationId = await saveQuote(db, quote.id, contact, {
      status: unfulfilled ? "unfulfilled" : "confirmed",
      ...saved,
    });
  } catch (error) {
    if (
      !(
        error instanceof HttpError &&
        (error.message === "no availability" ||
          error.message === "too many guests for this room type")
      )
    )
      throw error;
    reservationId = await saveQuote(db, quote.id, contact, {
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

async function acceptedContact(db: Db, acceptanceId: string | null) {
  const [contact] = acceptanceId
    ? await db
        .select({
          fullName: checkoutAcceptances.fullName,
          email: checkoutAcceptances.email,
          phone: checkoutAcceptances.phone,
          notes: checkoutAcceptances.notes,
        })
        .from(checkoutAcceptances)
        .where(eq(checkoutAcceptances.id, acceptanceId))
    : [];
  if (!contact) throw new Error("payment attempt has no accepted contact");
  return contact;
}

type Contact = Awaited<ReturnType<typeof acceptedContact>>;

function confirmationProvenance(attempt: Attempt): ConfirmationProvenance | null {
  if (!attempt.confirmationEmailEligible || !attempt.checkoutId || !attempt.acceptanceId)
    return null;
  return {
    attemptId: attempt.id,
    checkoutId: attempt.checkoutId,
    acceptanceId: attempt.acceptanceId,
    recipientEmail: attempt.email,
    language: attempt.language,
  };
}

async function rebookedSince(db: Db, quote: Quote, attempt: Pick<Attempt, "email" | "calledAt">) {
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
        gte(reservations.createdAt, attempt.calledAt),
        eq(sql`lower(${guests.email})`, attempt.email.toLowerCase()),
      ),
    )
    .limit(1);
  return row !== undefined;
}

const matches = (attempt: Attempt, culqiCharge: CulqiCharge) =>
  isSuccessfulCharge(culqiCharge) &&
  culqiCharge.amount === attempt.amountCents &&
  culqiCharge.currency_code === attempt.currency &&
  culqiCharge.email === attempt.email;

const chargeRequest = (attempt: Attempt, contact: Pick<Contact, "fullName" | "phone">) => ({
  attemptId: attempt.id,
  amountCents: attempt.amountCents,
  currency: attempt.currency,
  email: attempt.email,
  sourceId: attempt.sourceId,
  fullName: contact.fullName,
  phone: contact.phone,
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
        .catch(() => console.error("payment attempt lookup failed")),
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
