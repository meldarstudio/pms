import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const roomTypes = sqliteTable('room_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  maxOccupancy: integer('max_occupancy').notNull(),
  baseRateCents: integer('base_rate_cents').notNull(),
  createdAt: text('created_at').notNull(),
})

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  number: text('number').notNull().unique(),
  roomTypeId: text('room_type_id')
    .notNull()
    .references(() => roomTypes.id),
})

export const roomClosures = sqliteTable(
  'room_closures',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    starts: text('starts').notNull(),
    ends: text('ends').notNull(),
    reason: text('reason'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('room_closures_room').on(table.roomId, table.starts, table.ends)],
)

export const guests = sqliteTable('guests', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull().default(''),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  documentType: text('document_type'),
  documentNumber: text('document_number'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
})

export const reservations = sqliteTable(
  'reservations',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    version: integer('version').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    cancelledAt: text('cancelled_at'),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    checkIn: text('check_in').notNull(),
    checkOut: text('check_out').notNull(),
    source: text('source').notNull().default('desk'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('reservations_dates').on(table.checkIn, table.checkOut),
    index('reservations_guest').on(table.guestId),
  ],
)

export const reservationRooms = sqliteTable(
  'reservation_rooms',
  {
    id: text('id').primaryKey(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservations.id),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    roomId: text('room_id').references(() => rooms.id),
    adults: integer('adults').notNull(),
    children: integer('children').notNull().default(0),
    status: text('status').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    checkIn: text('check_in'),
    checkOut: text('check_out'),
    originalCheckIn: text('original_check_in'),
    originalCheckOut: text('original_check_out'),
    actualArrival: text('actual_arrival'),
    actualDeparture: text('actual_departure'),
    assignmentStart: text('assignment_start'),
    cancellationReason: text('cancellation_reason'),
    originalNights: text('original_nights'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('reservation_rooms_reservation').on(table.reservationId),
    index('reservation_rooms_type').on(table.roomTypeId),
    index('reservation_rooms_room').on(table.roomId),
  ],
)

export const reservationRoomNights = sqliteTable(
  'reservation_room_nights',
  {
    id: text('id').primaryKey(),
    reservationRoomId: text('reservation_room_id')
      .notNull()
      .references(() => reservationRooms.id),
    date: text('date').notNull(),
    priceCents: integer('price_cents').notNull(),
  },
  (table) => [
    uniqueIndex('reservation_room_nights_unique').on(table.reservationRoomId, table.date),
  ],
)

export const reservationGuests = sqliteTable(
  'reservation_guests',
  {
    id: text('id').primaryKey(),
    reservationId: text('reservation_id').notNull().references(() => reservations.id),
    reservationRoomId: text('reservation_room_id').references(() => reservationRooms.id),
    fullName: text('full_name').notNull().default(''),
  firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    documentType: text('document_type'),
    documentNumber: text('document_number'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('reservation_guests_reservation').on(table.reservationId)],
)

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservations.id),
    amountCents: integer('amount_cents').notNull(),
    method: text('method').notNull(),
    reference: text('reference'),
    paidAt: text('paid_at').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('payments_reservation').on(table.reservationId),
    index('payments_paid_at').on(table.paidAt),
  ],
)

export const roomTypeRates = sqliteTable(
  'room_type_rates',
  {
    id: text('id').primaryKey(),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    date: text('date').notNull(),
    priceCents: integer('price_cents').notNull(),
  },
  (table) => [uniqueIndex('room_type_rates_unique').on(table.roomTypeId, table.date)],
)

export const financialEntries = sqliteTable(
  'financial_entries',
  {
    id: text('id').primaryKey(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservations.id),
    kind: text('kind').notNull(),
    amountCents: integer('amount_cents').notNull(),
    appliedCents: integer('applied_cents').notNull().default(0),
    reason: text('reason'),
    method: text('method'),
    occurredAt: text('occurred_at').notNull(),
    paymentDate: text('payment_date'),
    reference: text('reference'),
    createdAt: text('created_at').notNull(),
    voidedAt: text('voided_at'),
    correctionReason: text('correction_reason'),
    replacesId: text('replaces_id'),
    legacy: integer('legacy').notNull().default(0),
  },
  (table) => [index('financial_reservation').on(table.reservationId)],
)

export const reservationEvents = sqliteTable(
  'reservation_events',
  {
    id: text('id').primaryKey(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservations.id),
    kind: text('kind').notNull(),
    reason: text('reason'),
    before: text('before').notNull(),
    after: text('after').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('events_reservation').on(table.reservationId)],
)

export const reservationRequests = sqliteTable('reservation_requests', {
  id: text('id').primaryKey(),
  reservationId: text('reservation_id')
    .notNull()
    .references(() => reservations.id),
  expectedVersion: integer('expected_version').notNull(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
})
