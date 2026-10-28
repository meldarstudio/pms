import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { GuestInput } from "@pms/shared";
import type { PricedNight } from "../lib/pricing";
import type { RatePlanTerms } from "../lib/rate-plans";

// Empty outside a protected write batch, never a cached deployment-wide clock.
export const propertyWriteContext = sqliteTable(
  "property_write_context",
  {
    id: integer("id").primaryKey(),
    propertyDate: text("property_date").notNull(),
  },
  (table) => [check("property_write_singleton", sql`${table.id} = 1`)],
);

export const roomTypes = sqliteTable("room_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  maxAdults: integer("max_occupancy").notNull(),
  maxChildren: integer("max_children").notNull().default(2),
  baseRateCents: integer("base_rate_cents").notNull(),
  createdAt: text("created_at").notNull(),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  roomTypeId: text("room_type_id")
    .notNull()
    .references(() => roomTypes.id),
  housekeepingStatus: text("housekeeping_status").notNull().default("clean"),
  housekeepingChangedAt: text("housekeeping_changed_at"),
});

export const roomClosures = sqliteTable(
  "room_closures",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    starts: text("starts").notNull(),
    ends: text("ends").notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("room_closures_room").on(table.roomId, table.starts, table.ends)],
);

export const guests = sqliteTable("guests", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  documentType: text("document_type"),
  documentNumber: text("document_number"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// A price offered to an online guest for 10 minutes. It reserves no room inventory and
// references no setup rows, so staff bookings, closures and setup are never blocked by one.
export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  roomTypeId: text("room_type_id").notNull(),
  checkIn: text("check_in").notNull(),
  checkOut: text("check_out").notNull(),
  adults: integer("adults").notNull(),
  children: integer("children").notNull(),
  /** The quoted nights, saved unchanged on the reservation made from the quote. */
  nights: text("nights", { mode: "json" }).$type<PricedNight[]>().notNull(),
  /** The offered rate-plan terms, stored as the reservation's accepted terms. */
  terms: text("terms", { mode: "json" }).$type<RatePlanTerms>().notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const reservations = sqliteTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    revision: integer("revision").notNull().default(0),
    code: text("code").notNull().unique(),
    status: text("status").notNull().default("confirmed"),
    cancellationReason: text("cancellation_reason"),
    discountCents: integer("discount_cents").notNull().default(0),
    cancelledAt: text("cancelled_at"),
    guestId: text("guest_id")
      .notNull()
      .references(() => guests.id),
    checkIn: text("check_in").notNull(),
    checkOut: text("check_out").notNull(),
    source: text("source").notNull().default("desk"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    // Accepted rate-plan terms. Defaults give legacy rows and older Workers Flexible terms.
    ratePlan: text("rate_plan").notNull().default("flexible"),
    cancellationChargeBasis: text("cancellation_charge_basis").notNull().default("first_night"),
    freeCancellationDays: integer("free_cancellation_days").default(2),
    // Superseded by free_cancellation_days. Still written so a Worker from before
    // migration 0011 reads the same terms; a later release drops both.
    freeCancellationHours: integer("free_cancellation_hours").default(48),
    checkInTime: text("check_in_time").notNull().default("15:00"),
    paymentSchedule: text("payment_schedule").notNull().default("first_night_deposit"),
    priceAdjustmentPercent: integer("price_adjustment_percent").notNull().default(0),
    /** The quote an online reservation was saved from; one quote saves at most one. */
    quoteId: text("quote_id").references(() => quotes.id),
  },
  (table) => [
    index("reservations_dates").on(table.checkIn, table.checkOut),
    index("reservations_guest").on(table.guestId),
    uniqueIndex("reservations_quote").on(table.quoteId),
  ],
);

export const reservationRooms = sqliteTable(
  "reservation_rooms",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    roomTypeId: text("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    roomId: text("room_id").references(() => rooms.id),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("reservation_rooms_reservation").on(table.reservationId),
    index("reservation_rooms_type").on(table.roomTypeId),
    index("reservation_rooms_room").on(table.roomId),
  ],
);

export const reservationRoomNights = sqliteTable(
  "reservation_room_nights",
  {
    id: text("id").primaryKey(),
    reservationRoomId: text("reservation_room_id")
      .notNull()
      .references(() => reservationRooms.id),
    date: text("date").notNull(),
    /** The final price charged for the night, after the adjustment and discount below. */
    priceCents: integer("price_cents").notNull(),
    // The ordinary rate is price - adjustment + discount. Zero defaults describe
    // rows from before migration 0010 and inserts by an older Worker exactly.
    /** The accepted rate plan's price adjustment, in cents; negative for a reduction. */
    adjustmentCents: integer("adjustment_cents").notNull().default(0),
    /** A staff discount on this night, in cents. */
    discountCents: integer("discount_cents").notNull().default(0),
  },
  (table) => [
    uniqueIndex("reservation_room_nights_unique").on(table.reservationRoomId, table.date),
  ],
);

export const reservationGuests = sqliteTable(
  "reservation_guests",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    reservationRoomId: text("reservation_room_id").references(() => reservationRooms.id),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    documentType: text("document_type"),
    documentNumber: text("document_number"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("reservation_guests_reservation").on(table.reservationId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    paymentDate: text("payment_date").notNull(),
    createdAt: text("created_at").notNull(),
    notes: text("notes"),
    /** The Culqi charge that collected this payment; such a payment is never edited or deleted. */
    culqiChargeId: text("culqi_charge_id"),
  },
  (table) => [
    index("payments_reservation").on(table.reservationId),
    index("payments_date").on(table.paymentDate),
    uniqueIndex("payments_culqi_charge").on(table.culqiChargeId),
  ],
);

/**
 * `unknown` before and after a call until resolved, `review` waiting for 3DS, `failed`,
 * `succeeded` (charged, reservation not saved yet) or `saved`.
 */
export type AttemptStatus = "unknown" | "review" | "failed" | "succeeded" | "saved";

// One request to charge an online guest for a quote, saved before each Culqi call.
// `unknown` means a call is in flight or its response was lost: it is resolved by
// looking the charge up, never by charging again.
export const paymentAttempts = sqliteTable(
  "payment_attempts",
  {
    /** Sent to Culqi as `metadata.attempt_id`. */
    id: text("id").primaryKey(),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    email: text("email").notNull(),
    /** The booking contact the reservation is saved with. */
    guest: text("guest", { mode: "json" }).$type<GuestInput>().notNull(),
    /** The Culqi token, reused only for this attempt's 3DS continuation. */
    sourceId: text("source_id").notNull(),
    deviceFingerprint: text("device_fingerprint"),
    status: text("status").$type<AttemptStatus>().notNull(),
    createdAt: text("created_at").notNull(),
    /** When the latest Culqi charge call started. */
    calledAt: text("called_at").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    culqiChargeId: text("culqi_charge_id"),
    reservationId: text("reservation_id").references(() => reservations.id),
  },
  (table) => [
    index("payment_attempts_status").on(table.status, table.calledAt),
    // At most one attempt per quote is open or paid, so concurrent starts cannot both charge.
    uniqueIndex("payment_attempts_open")
      .on(table.quoteId)
      .where(sql`${table.status} IN ('unknown', 'review', 'succeeded', 'saved')`),
    uniqueIndex("payment_attempts_charge").on(table.culqiChargeId),
  ],
);

export const roomTypeRates = sqliteTable(
  "room_type_rates",
  {
    id: text("id").primaryKey(),
    roomTypeId: text("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    date: text("date").notNull(),
    priceCents: integer("price_cents").notNull(),
  },
  (table) => [uniqueIndex("room_type_rates_unique").on(table.roomTypeId, table.date)],
);

export const reservationRequests = sqliteTable("reservation_requests", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id")
    .notNull()
    .references(() => reservations.id),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});

// One row per cancellation or no-show. The charge is computed from the accepted
// terms when the outcome is recorded and never recomputed; restoration marks it inactive.
export const reservationCancellations = sqliteTable(
  "reservation_cancellations",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    /** The status it was recorded for: `cancelled` or `no_show`. */
    outcome: text("outcome").notNull().default("cancelled"),
    recordedAt: text("recorded_at").notNull(),
    /** The last free-cancellation date in the property calendar; null for a no-show or terms never free. */
    freeUntil: text("free_until"),
    policyChargeCents: integer("policy_charge_cents").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id),
    restoredAt: text("restored_at"),
  },
  (table) => [
    uniqueIndex("reservation_cancellations_active")
      .on(table.reservationId)
      .where(sql`${table.restoredAt} IS NULL`),
    check("reservation_cancellations_charge", sql`${table.policyChargeCents} >= 0`),
  ],
);

// Staff reductions of a cancellation charge. A waiver is neither a payment nor a refund.
export const cancellationWaivers = sqliteTable(
  "cancellation_waivers",
  {
    id: text("id").primaryKey(),
    cancellationId: text("cancellation_id")
      .notNull()
      .references(() => reservationCancellations.id),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    recordedAt: text("recorded_at").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    index("cancellation_waivers_cancellation").on(table.cancellationId),
    check("cancellation_waivers_amount", sql`${table.amountCents} > 0`),
  ],
);

// Money returned against a received payment. Only a completed refund counts as
// returned money; a failed request stays as history and is never deleted.
export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    amountCents: integer("amount_cents").notNull(),
    /** The channel the money is returned through, using payment methods. */
    method: text("method").notNull(),
    reference: text("reference"),
    reason: text("reason").notNull(),
    /** `requested`, then `completed` or `failed`. */
    status: text("status").notNull().default("requested"),
    requestedAt: text("requested_at").notNull(),
    requestedAccountId: text("requested_account_id")
      .notNull()
      .references(() => user.id),
    resolvedAt: text("resolved_at"),
    resolvedAccountId: text("resolved_account_id").references(() => user.id),
    /** The property date the money was returned; set on completion. */
    refundDate: text("refund_date"),
    completionReference: text("completion_reference"),
    failureReason: text("failure_reason"),
    /** Set when staff refund through the Culqi API against this charge. */
    culqiChargeId: text("culqi_charge_id"),
    /** Culqi's refund ID, when its response returned one. */
    culqiRefundId: text("culqi_refund_id"),
  },
  (table) => [
    index("refunds_reservation").on(table.reservationId),
    index("refunds_payment").on(table.paymentId),
    index("refunds_date").on(table.refundDate),
    check("refunds_amount", sql`${table.amountCents} > 0`),
    check(
      "refunds_outcome",
      sql`(${table.status} = 'requested' AND ${table.resolvedAt} IS NULL AND ${table.resolvedAccountId} IS NULL
          AND ${table.refundDate} IS NULL AND ${table.completionReference} IS NULL AND ${table.failureReason} IS NULL)
        OR (${table.status} = 'completed' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedAccountId} IS NOT NULL
          AND ${table.refundDate} IS NOT NULL AND ${table.completionReference} IS NOT NULL AND ${table.failureReason} IS NULL)
        OR (${table.status} = 'failed' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedAccountId} IS NOT NULL
          AND ${table.refundDate} IS NULL AND ${table.completionReference} IS NULL AND ${table.failureReason} IS NOT NULL)`,
    ),
  ],
);

// Better Auth tables. Field names are Better Auth's; times are epoch milliseconds.
const authTime = (name: string) => integer(name, { mode: "timestamp_ms" });

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    username: text("username").unique(),
    displayUsername: text("display_username"),
    role: text("role").notNull().default("staff"),
    createdAt: authTime("created_at").notNull(),
    updatedAt: authTime("updated_at").notNull(),
  },
  (table) => [check("user_role", sql`${table.role} IN ('staff', 'owner')`)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: authTime("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: authTime("created_at").notNull(),
    updatedAt: authTime("updated_at").notNull(),
  },
  (table) => [index("session_user").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: authTime("access_token_expires_at"),
    refreshTokenExpiresAt: authTime("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: authTime("created_at").notNull(),
    updatedAt: authTime("updated_at").notNull(),
  },
  (table) => [index("account_user").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: authTime("expires_at").notNull(),
    createdAt: authTime("created_at").notNull(),
    updatedAt: authTime("updated_at").notNull(),
  },
  (table) => [index("verification_identifier").on(table.identifier)],
);
