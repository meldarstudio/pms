import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { CheckoutLanguage } from "@pms/shared";
import type { PricedNight } from "../lib/pricing";
import type { RatePlanCode, RatePlanTerms } from "../lib/rate-plans";

export const propertyWriteContext = sqliteTable(
  "property_write_context",
  {
    id: integer("id").primaryKey(),
    propertyDate: text("property_date").notNull(),
  },
  (table) => [check("property_write_singleton", sql`${table.id} = 1`)],
);

export const operationControls = sqliteTable(
  "operation_controls",
  {
    id: integer("id").primaryKey(),
    publicPaymentsAdmitted: integer("public_payments_admitted", { mode: "boolean" })
      .notNull()
      .default(false),
    retiredEmailSubmissionAdmitted: integer("email_submission_admitted", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [check("operation_controls_singleton", sql`${table.id} = 1`)],
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
  nationality: text("nationality"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const publicCheckouts = sqliteTable(
  "public_checkouts",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    roomTypeId: text("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    checkIn: text("check_in").notNull(),
    checkOut: text("check_out").notNull(),
    adults: integer("adults").notNull(),
    children: integer("children").notNull(),
    ratePlan: text("rate_plan").$type<RatePlanCode>().notNull(),
    language: text("language").$type<CheckoutLanguage>().notNull(),
    createdAt: text("created_at").notNull(),
    reservedOnce: integer("reserved_once", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("public_checkouts_never_reserved_age")
      .on(table.createdAt)
      .where(sql`${table.reservedOnce} = 0`),
  ],
);

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    roomTypeId: text("room_type_id").notNull(),
    checkIn: text("check_in").notNull(),
    checkOut: text("check_out").notNull(),
    adults: integer("adults").notNull(),
    children: integer("children").notNull(),
    nights: text("nights", { mode: "json" }).$type<PricedNight[]>().notNull(),
    terms: text("terms", { mode: "json" }).$type<RatePlanTerms>().notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    checkoutId: text("checkout_id").references(() => publicCheckouts.id),
  },
  (table) => [index("quotes_checkout").on(table.checkoutId, table.createdAt)],
);

export const checkoutAcceptances = sqliteTable(
  "checkout_acceptances",
  {
    id: text("id").primaryKey(),
    checkoutId: text("checkout_id")
      .notNull()
      .references(() => publicCheckouts.id),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    notes: text("notes"),
    language: text("language").$type<CheckoutLanguage>().notNull(),
    acceptedAt: text("accepted_at").notNull(),
  },
  (table) => [
    index("checkout_acceptances_checkout").on(table.checkoutId, table.acceptedAt),
    index("checkout_acceptances_quote").on(table.quoteId),
  ],
);

export const reservationStatuses = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
  "unfulfilled",
] as const;
export type ReservationStatus = (typeof reservationStatuses)[number];

export const reservations = sqliteTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    revision: integer("revision").notNull().default(0),
    code: text("code").notNull().unique(),
    status: text("status").$type<ReservationStatus>().notNull().default("confirmed"),
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
    ratePlan: text("rate_plan").notNull().default("flexible"),
    cancellationChargeBasis: text("cancellation_charge_basis").notNull().default("first_night"),
    freeCancellationDays: integer("free_cancellation_days").default(2),
    freeCancellationHours: integer("free_cancellation_hours").default(48),
    checkInTime: text("check_in_time").notNull().default("15:00"),
    paymentSchedule: text("payment_schedule").notNull().default("first_night_deposit"),
    priceAdjustmentPercent: integer("price_adjustment_percent").notNull().default(0),
    quoteId: text("quote_id").references(() => quotes.id),
    publicCheckoutId: text("public_checkout_id").references(() => publicCheckouts.id),
  },
  (table) => [
    index("reservations_dates").on(table.checkIn, table.checkOut),
    index("reservations_guest").on(table.guestId),
    uniqueIndex("reservations_quote").on(table.quoteId),
    index("reservations_public_checkout").on(table.publicCheckoutId),
  ],
);

export const reservationAccess = sqliteTable("reservation_access", {
  reservationId: text("reservation_id")
    .primaryKey()
    .references(() => reservations.id),
  token: text("token").notNull().unique(),
  expiresOn: text("expires_on").notNull(),
  createdAt: text("created_at").notNull(),
});

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
    priceCents: integer("price_cents").notNull(),
    adjustmentCents: integer("adjustment_cents").notNull().default(0),
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
    culqiChargeId: text("culqi_charge_id"),
  },
  (table) => [
    index("payments_reservation").on(table.reservationId),
    index("payments_date").on(table.paymentDate),
    uniqueIndex("payments_culqi_charge").on(table.culqiChargeId),
  ],
);

export const attemptStatuses = ["unknown", "review", "failed", "succeeded", "saved"] as const;
export type AttemptStatus = (typeof attemptStatuses)[number];

export const paymentAttempts = sqliteTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    email: text("email").notNull(),
    sourceId: text("source_id").notNull(),
    deviceFingerprint: text("device_fingerprint"),
    status: text("status").$type<AttemptStatus>().notNull(),
    createdAt: text("created_at").notNull(),
    calledAt: text("called_at").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    culqiChargeId: text("culqi_charge_id"),
    reservationId: text("reservation_id").references(() => reservations.id),
    checkoutId: text("checkout_id").references(() => publicCheckouts.id),
    acceptanceId: text("acceptance_id").references(() => checkoutAcceptances.id),
    language: text("language").$type<CheckoutLanguage>(),
    confirmationEmailEligible: integer("confirmation_email_eligible", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("payment_attempts_status").on(table.status, table.calledAt),
    index("payment_attempts_checkout").on(table.checkoutId, table.createdAt),
    index("payment_attempts_quote").on(table.quoteId),
    index("payment_attempts_acceptance").on(table.acceptanceId),
    uniqueIndex("payment_attempts_checkout_open")
      .on(table.checkoutId)
      .where(sql`${table.status} IN ('unknown', 'review', 'succeeded', 'saved')`),
    uniqueIndex("payment_attempts_open")
      .on(table.quoteId)
      .where(sql`${table.status} IN ('unknown', 'review', 'succeeded', 'saved')`),
    uniqueIndex("payment_attempts_charge").on(table.culqiChargeId),
  ],
);

export type ConfirmationEmailKind = "automatic" | "resend";
export type ConfirmationEmailStatus = "pending" | "sent" | "failed";

export const confirmationEmails = sqliteTable(
  "confirmation_emails",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    recipient: text("recipient").notNull(),
    language: text("language").$type<CheckoutLanguage>().notNull(),
    kind: text("kind").$type<ConfirmationEmailKind>().notNull(),
    status: text("status").$type<ConfirmationEmailStatus>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    pendingRequest: text("pending_request"),
    requestedBy: text("requested_by").references(() => user.id),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (table) => [
    uniqueIndex("confirmation_emails_automatic")
      .on(table.reservationId)
      .where(sql`${table.kind} = 'automatic'`),
    index("confirmation_emails_reservation").on(table.reservationId, table.createdAt),
    index("confirmation_emails_due").on(table.status, table.nextAttemptAt),
    check("confirmation_emails_kind", sql`${table.kind} IN ('automatic', 'resend')`),
    check("confirmation_emails_status", sql`${table.status} IN ('pending', 'sent', 'failed')`),
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

export const reservationCancellations = sqliteTable(
  "reservation_cancellations",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    outcome: text("outcome").notNull().default("cancelled"),
    recordedAt: text("recorded_at").notNull(),
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
    method: text("method").notNull(),
    reference: text("reference"),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("requested"),
    requestedAt: text("requested_at").notNull(),
    requestedAccountId: text("requested_account_id")
      .notNull()
      .references(() => user.id),
    resolvedAt: text("resolved_at"),
    resolvedAccountId: text("resolved_account_id").references(() => user.id),
    refundDate: text("refund_date"),
    completionReference: text("completion_reference"),
    failureReason: text("failure_reason"),
    culqiChargeId: text("culqi_charge_id"),
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
          AND ${table.refundDate} IS NOT NULL AND ${table.failureReason} IS NULL)
        OR (${table.status} = 'failed' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedAccountId} IS NOT NULL
          AND ${table.refundDate} IS NULL AND ${table.completionReference} IS NULL AND ${table.failureReason} IS NOT NULL)`,
    ),
  ],
);

export const coupons = sqliteTable(
  "coupons",
  {
    id: text("id").primaryKey(),
    revision: integer("revision").notNull().default(0),
    code: text("code").notNull().unique(),
    sourceReservationId: text("source_reservation_id")
      .notNull()
      .references(() => reservations.id),
    valueCents: integer("value_cents").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    issuedAt: text("issued_at").notNull(),
    expiresOn: text("expires_on").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    index("coupons_source").on(table.sourceReservationId),
    check("coupons_value", sql`${table.valueCents} > 0`),
    check(
      "coupons_balance",
      sql`${table.balanceCents} >= 0 AND ${table.balanceCents} <= ${table.valueCents}`,
    ),
  ],
);

export type CouponMovementKind = "issue" | "redeem" | "return";

export const couponMovements = sqliteTable(
  "coupon_movements",
  {
    id: text("id").primaryKey(),
    couponId: text("coupon_id")
      .notNull()
      .references(() => coupons.id),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    kind: text("kind").$type<CouponMovementKind>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    recordedAt: text("recorded_at").notNull(),
    recordedOn: text("recorded_on").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    index("coupon_movements_coupon").on(table.couponId),
    index("coupon_movements_reservation").on(table.reservationId),
    index("coupon_movements_date").on(table.recordedOn),
    check("coupon_movements_amount", sql`${table.amountCents} > 0`),
    check("coupon_movements_kind", sql`${table.kind} IN ('issue', 'redeem', 'return')`),
  ],
);

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

export const complaintSheets = sqliteTable(
  "complaint_sheets",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").unique(),
    requestPayload: text("request_payload").notNull(),
    bookId: text("book_id").notNull(),
    number: integer("number").notNull(),
    reference: text("reference").notNull().unique(),
    establishmentId: text("establishment_id").notNull(),
    provider: text("provider", { mode: "json" })
      .$type<{ legalName: string; ruc: string; address: string }>()
      .notNull(),
    input: text("input", { mode: "json" }).$type<import("@pms/shared").ComplaintInput>().notNull(),
    currency: text("currency").notNull(),
    timeZone: text("time_zone").notNull(),
    filedAt: text("filed_at").notNull(),
    registeredAt: text("registered_at").notNull(),
    dueDate: text("due_date").notNull(),
    calendarSource: text("calendar_source").notNull(),
    policy: text("policy").notNull(),
    source: text("source").$type<"virtual" | "physical">().notNull(),
    originalReference: text("original_reference").unique(),
    restoredAt: text("restored_at"),
  },
  (table) => [uniqueIndex("complaint_book_number").on(table.bookId, table.number)],
);

export const complaintResponses = sqliteTable("complaint_responses", {
  id: text("id").primaryKey(),
  complaintId: text("complaint_id")
    .notNull()
    .references(() => complaintSheets.id),
  payload: text("payload").notNull(),
  text: text("text").notNull(),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  sentAt: text("sent_at").notNull(),
  evidence: text("evidence").notNull(),
  correctsId: text("corrects_id"),
  recordedAt: text("recorded_at").notNull(),
  recordedBy: text("recorded_by")
    .notNull()
    .references(() => user.id),
});

export const complaintEmails = sqliteTable(
  "complaint_emails",
  {
    id: text("id").primaryKey(),
    complaintId: text("complaint_id")
      .notNull()
      .references(() => complaintSheets.id),
    status: text("status").$type<"pending" | "sent" | "failed" | "not_requested">().notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    pendingRequest: text("pending_request"),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull(),
    retryRequestId: text("retry_request_id"),
  },
  (table) => [
    uniqueIndex("complaint_receipt_email").on(table.complaintId),
    index("complaint_emails_due").on(table.status, table.nextAttemptAt),
  ],
);
