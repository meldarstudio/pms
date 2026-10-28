import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    freeCancellationHours: integer("free_cancellation_hours").default(48),
    checkInTime: text("check_in_time").notNull().default("15:00"),
    paymentSchedule: text("payment_schedule").notNull().default("first_night_deposit"),
    priceAdjustmentPercent: integer("price_adjustment_percent").notNull().default(0),
  },
  (table) => [
    index("reservations_dates").on(table.checkIn, table.checkOut),
    index("reservations_guest").on(table.guestId),
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
    priceCents: integer("price_cents").notNull(),
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
  },
  (table) => [
    index("payments_reservation").on(table.reservationId),
    index("payments_date").on(table.paymentDate),
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

// One row per cancellation. The charge is computed from the accepted terms when
// cancellation is recorded and never recomputed; restoration marks it inactive.
export const reservationCancellations = sqliteTable(
  "reservation_cancellations",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id),
    recordedAt: text("recorded_at").notNull(),
    /** The free-cancellation deadline in UTC; null when the terms are never free. */
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
