import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./db";
import { checkoutAcceptances, paymentAttempts, publicCheckouts, quotes } from "./db/schema";

const ABANDONED_AFTER_DAYS = 30;
const CHECKOUTS_PER_RUN = 20;
const LEGACY_QUOTES_PER_RUN = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const noActivitySince = (checkout: SQL, cutoff: string) => sql`
  NOT EXISTS (SELECT 1 FROM reservations WHERE public_checkout_id = ${checkout})
  AND NOT EXISTS (SELECT 1 FROM reservations
    WHERE quote_id IN (SELECT id FROM quotes WHERE checkout_id = ${checkout}))
  AND NOT EXISTS (SELECT 1 FROM payment_attempts
    WHERE (checkout_id = ${checkout} OR quote_id IN (SELECT id FROM quotes WHERE checkout_id = ${checkout}))
    AND (status <> 'failed' OR called_at >= ${cutoff}))
  AND NOT EXISTS (SELECT 1 FROM quotes WHERE checkout_id = ${checkout} AND created_at >= ${cutoff})
  AND NOT EXISTS (SELECT 1 FROM checkout_acceptances
    WHERE checkout_id = ${checkout} AND accepted_at >= ${cutoff})`;

const abandonedCheckout = (id: string, cutoff: string) => sql`
  EXISTS (SELECT 1 FROM public_checkouts WHERE id = ${id} AND created_at < ${cutoff})
  AND ${noActivitySince(sql`${id}`, cutoff)}`;

const unclaimedLegacyQuote = (quote: SQL, cutoff: string) => sql`
  NOT EXISTS (SELECT 1 FROM reservations WHERE quote_id = ${quote})
  AND NOT EXISTS (SELECT 1 FROM checkout_acceptances WHERE quote_id = ${quote})
  AND NOT EXISTS (SELECT 1 FROM payment_attempts WHERE quote_id = ${quote}
    AND (status <> 'failed' OR called_at >= ${cutoff}))`;

const abandonedLegacyQuote = (id: string, cutoff: string) => sql`
  EXISTS (SELECT 1 FROM quotes WHERE id = ${id} AND checkout_id IS NULL AND expires_at < ${cutoff})
  AND ${unclaimedLegacyQuote(sql`${id}`, cutoff)}`;

export async function purgeAbandonedCheckouts(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_DAYS * DAY_MS).toISOString();
  const [checkouts, legacyQuotes] = await db.batch([
    db
      .select({ id: publicCheckouts.id })
      .from(publicCheckouts)
      .where(
        sql`reserved_once = 0 AND created_at < ${cutoff}
          AND ${noActivitySince(sql`public_checkouts.id`, cutoff)}`,
      )
      .orderBy(publicCheckouts.createdAt)
      .limit(CHECKOUTS_PER_RUN),
    db
      .select({ id: quotes.id })
      .from(quotes)
      .where(
        sql`checkout_id IS NULL AND created_at < ${cutoff} AND expires_at < ${cutoff}
          AND ${unclaimedLegacyQuote(sql`quotes.id`, cutoff)}`,
      )
      .orderBy(quotes.createdAt)
      .limit(LEGACY_QUOTES_PER_RUN),
  ]);
  for (const { id } of checkouts) {
    try {
      await deleteAbandonedCheckout(db, id, cutoff);
    } catch {
      console.error("abandoned checkout purge failed", id);
    }
  }
  for (const { id } of legacyQuotes) {
    try {
      await deleteAbandonedLegacyQuote(db, id, cutoff);
    } catch {
      console.error("abandoned legacy quote purge failed", id);
    }
  }
}

async function deleteAbandonedCheckout(db: Db, id: string, cutoff: string) {
  const abandoned = abandonedCheckout(id, cutoff);
  await db.batch([
    db
      .delete(paymentAttempts)
      .where(
        and(
          or(
            eq(paymentAttempts.checkoutId, id),
            inArray(
              paymentAttempts.quoteId,
              db.select({ id: quotes.id }).from(quotes).where(eq(quotes.checkoutId, id)),
            ),
          ),
          abandoned,
        ),
      ),
    db.delete(checkoutAcceptances).where(and(eq(checkoutAcceptances.checkoutId, id), abandoned)),
    db.delete(quotes).where(and(eq(quotes.checkoutId, id), abandoned)),
    db.delete(publicCheckouts).where(and(eq(publicCheckouts.id, id), abandoned)),
  ]);
}

async function deleteAbandonedLegacyQuote(db: Db, id: string, cutoff: string) {
  const abandoned = abandonedLegacyQuote(id, cutoff);
  await db.batch([
    db.delete(paymentAttempts).where(and(eq(paymentAttempts.quoteId, id), abandoned)),
    db.delete(quotes).where(and(eq(quotes.id, id), abandoned)),
  ]);
}
