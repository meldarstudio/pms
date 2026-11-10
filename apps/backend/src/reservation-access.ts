import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { reservationAccess, reservations, roomTypes } from "./db/schema";
import { HttpError } from "./http";
import { freeCancellationUntil, chargeableCents } from "./lib/cancellation";
import { addDays, nightsBetween } from "./lib/dates";
import { acceptedTerms } from "./lib/rate-plans";
import { reservationBill } from "./lib/reservation-bill";
import { holdsInventory } from "./lib/statuses";
import { loadReservation } from "./reservation-read";

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = Math.ceil((TOKEN_BYTES * 4) / 3);
const BEARER_TOKEN = new RegExp(`^bearer ([\\w-]{${TOKEN_LENGTH}})$`, "i");
const ACCESS_DAYS_AFTER_CHECKOUT = 30;

export const INVALID_RESERVATION_ACCESS = "invalid reservation access";
export const RESERVATION_ACCESS_NOT_ESTABLISHED = "reservation access was not established";

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reservationAccessValues(
  reservationId: string,
  checkOut: string,
  now: string,
) {
  const token = newToken();
  return {
    reservationId,
    token,
    tokenHash: await tokenHash(token),
    expiresOn: addDays(checkOut, ACCESS_DAYS_AFTER_CHECKOUT),
    createdAt: now,
  };
}

export async function reservationForAccessToken(
  db: Db,
  authorization: string | undefined,
  today: string,
) {
  const token = BEARER_TOKEN.exec(authorization ?? "")?.[1];
  const [access] = token
    ? await db
        .select()
        .from(reservationAccess)
        .where(eq(reservationAccess.tokenHash, await tokenHash(token)))
    : [];
  if (!access || today > access.expiresOn) throw new HttpError(401, INVALID_RESERVATION_ACCESS);
  return access;
}

export async function reservationSummary(db: Db, reservationId: string, today: string) {
  const state = await loadReservation(db, reservationId);
  const { reservation, contact, lines } = state;
  const bill = reservationBill(state);
  const terms = acceptedTerms(reservation);
  const freeUntil = freeCancellationUntil(terms.cancellationPolicy, reservation.checkIn);
  const typeIds = [...new Set(lines.map((line) => line.roomTypeId))];
  const types = typeIds.length
    ? await db
        .select({ id: roomTypes.id, name: roomTypes.name })
        .from(roomTypes)
        .where(inArray(roomTypes.id, typeIds))
    : [];
  const names = new Map(types.map((type) => [type.id, type.name]));
  const open = holdsInventory(reservation.status);
  const freeCancellation = freeUntil === null ? "none" : today <= freeUntil ? "available" : "ended";
  return {
    status: reservation.status,
    code: reservation.code,
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut,
    nights: nightsBetween(reservation.checkIn, reservation.checkOut).length,
    fullName: contact.fullName,
    rooms: lines.map((line) => ({
      roomTypeId: line.roomTypeId,
      name: names.get(line.roomTypeId) ?? "",
      adults: line.adults,
      children: line.children,
      nights: line.nights
        .toSorted((a, b) => a.date.localeCompare(b.date))
        .map(({ date, priceCents }) => ({ date, priceCents })),
    })),
    ratePlan: terms.plan,
    cancellation: {
      ...(open ? { freeCancellation } : {}),
      freeUntil,
      chargeCents: chargeableCents(terms.cancellationPolicy, lines, reservation.discountCents),
    },
    totalCents: bill.totalCents,
    paidCents: bill.paidCents,
    outstandingCents: Math.max(0, bill.balanceCents),
    refundDueCents: bill.refundDueCents,
    refundedCents: bill.refundedCents,
  };
}

export async function checkoutReservationAccess(db: Db, checkoutId: string) {
  const [access] = await db
    .select({ token: reservationAccess.token, expiresOn: reservationAccess.expiresOn })
    .from(reservationAccess)
    .innerJoin(reservations, eq(reservations.id, reservationAccess.reservationId))
    .where(eq(reservations.publicCheckoutId, checkoutId))
    .orderBy(asc(reservations.createdAt), asc(reservations.id))
    .limit(1);
  if (!access) throw new HttpError(404, RESERVATION_ACCESS_NOT_ESTABLISHED);
  return access;
}

export async function staffReservationAccess(db: Db, reservationId: string, today: string) {
  await loadReservation(db, reservationId);
  const [access] = await db
    .select({ token: reservationAccess.token, expiresOn: reservationAccess.expiresOn })
    .from(reservationAccess)
    .where(eq(reservationAccess.reservationId, reservationId));
  if (!access) throw new HttpError(404, RESERVATION_ACCESS_NOT_ESTABLISHED);
  return { ...access, expired: today > access.expiresOn };
}
