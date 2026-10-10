import type { WorkflowAction, WorkflowCommand, WorkflowCreate } from '@pms/shared'
import { eq, inArray } from 'drizzle-orm'
import { getDb, runBatch, type Db } from './db'
import {
  financialEntries,
  guests,
  reservationGuests,
  reservationRequests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomClosures,
  rooms,
  roomTypes,
} from './db/schema'
import { HttpError, rethrowConflict } from './http'
import { ratesBetween } from './inventory'
import { bill, reduceWaivers } from './lib/workflow-billing'
import { quoteNights, overridesFor } from './lib/quote'
import { assertOccupancy, requireStay } from './rules'
import { confirmationCode } from './lib/codes'
import { chunks } from './lib/chunks'

type Night = { date: string; priceCents: number }
export type Stay = typeof reservationRooms.$inferSelect & { nights: Night[] }
export type State = {
  reservation: typeof reservations.$inferSelect
  contact: typeof guests.$inferSelect
  stayingGuests: (typeof reservationGuests.$inferSelect)[]
  lines: Stay[]
  entries: (typeof financialEntries.$inferSelect)[]
}
const active = (s: string) => ['confirmed', 'checked_in', 'checked_out'].includes(s)
const fail = (message: string): never => {
  throw new HttpError(400, message)
}
export const charges = (state: State) =>
  state.lines
    .filter((l) => l.status !== 'cancelled' && l.status !== 'no_show')
    .reduce((sum, l) => sum + l.nights.reduce((s, n) => s + n.priceCents, 0), 0)
export const totals = (state: State) =>
  bill(
    charges(state),
    state.lines.some((l) => l.status !== 'cancelled' && l.status !== 'no_show')
      ? state.entries
      : [],
  )

export async function loadState(db: Db, id: string): Promise<State> {
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) throw new HttpError(404, 'reservation not found')
  const [contact] = await db.select().from(guests).where(eq(guests.id, reservation.guestId))
  const stayingGuests = await db
    .select()
    .from(reservationGuests)
    .where(eq(reservationGuests.reservationId, id))
  const lines = await db
    .select()
    .from(reservationRooms)
    .where(eq(reservationRooms.reservationId, id))
  const nights = lines.length
    ? await db
        .select()
        .from(reservationRoomNights)
        .where(
          inArray(
            reservationRoomNights.reservationRoomId,
            lines.map((l) => l.id),
          ),
        )
    : []
  const entries = await db
    .select()
    .from(financialEntries)
    .where(eq(financialEntries.reservationId, id))
  return {
    reservation,
    contact,
    stayingGuests,
    lines: lines.map((l) => ({
      ...l,
      checkIn: l.checkIn ?? reservation.checkIn,
      checkOut: l.checkOut ?? reservation.checkOut,
      nights: nights
        .filter((n) => n.reservationRoomId === l.id)
        .map((n) => ({ date: n.date, priceCents: n.priceCents })),
    })),
    entries,
  }
}

async function price(
  db: Db,
  room: {
    roomTypeId: string
    checkIn: string
    checkOut: string
    adults: number
    children: number
    nightlyRateCents?: number
  },
) {
  const dates = requireStay(room.checkIn, room.checkOut)
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, room.roomTypeId))
  if (!type) throw new HttpError(404, 'room type not found')
  assertOccupancy(room.adults, room.children, type.maxOccupancy)
  const rates = await ratesBetween(db, [type.id], room.checkIn, room.checkOut)
  return quoteNights(dates, type.baseRateCents, overridesFor(rates, type.id), room.nightlyRateCents)
}
async function validateAssignment(db: Db, line: Stay) {
  if (!line.roomId) return
  const [room] = await db.select().from(rooms).where(eq(rooms.id, line.roomId))
  if (!room) throw new HttpError(404, 'room not found')
  if (room.roomTypeId !== line.roomTypeId) fail('room is a different type')
}
async function newLine(
  db: Db,
  id: string,
  room: Extract<WorkflowAction, { type: 'add-room' }>['room'],
  now: string,
): Promise<Stay> {
  const nights = await price(db, room)
  const line: Stay = {
    id: crypto.randomUUID(),
    reservationId: id,
    roomTypeId: room.roomTypeId,
    roomId: room.roomId ?? null,
    adults: room.adults,
    children: room.children,
    status: 'confirmed',
    discountCents: 0,
    createdAt: now,
    checkIn: room.checkIn,
    checkOut: room.checkOut,
    originalCheckIn: room.checkIn,
    originalCheckOut: room.checkOut,
    actualArrival: null,
    actualDeparture: null,
    assignmentStart: room.checkIn,
    cancellationReason: null,
    originalNights: JSON.stringify(nights),
    nights,
  }
  await validateAssignment(db, line)
  return line
}

export async function plan(
  db: Db,
  original: State,
  actions: WorkflowAction[],
  now = new Date().toISOString(),
) {
  const state = structuredClone(original)

  if (actions.some((a) => a.type === 'cancel') && actions.length !== 1)
    fail('cancel booking separately from other changes')
  const lineFor = (id: string) =>
    state.lines.find((l) => l.id === id) ?? fail('room line not found')
  const addFinancial = (input: Extract<WorkflowAction, { type: 'financial' }>['entry']) => {
    if (input.kind !== 'payment' && input.kind !== 'discount')
      fail('refunds and waivers are not supported; edit the discount instead')
    const at = input.paymentDate ? `${input.paymentDate}T00:00:00.000Z` : (input.occurredAt ?? now)
    if (at > now) fail('financial date cannot be in the future')
    state.entries.push({
      id: crypto.randomUUID(),
      reservationId: state.reservation.id,
      kind: input.kind,
      amountCents: input.amountCents,
      appliedCents: input.kind === 'discount' ? input.amountCents : 0,
      reason: input.reason ?? null,
      method: input.method ?? null,
      occurredAt: at,
      paymentDate: input.paymentDate ?? null,
      reference: input.reference ?? null,
      createdAt: now,
      voidedAt: null,
      correctionReason: null,
      replacesId: null,
      legacy: 0,
    })
  }
  for (const action of actions) {
    const before = totals(state)
    if (action.type === 'contact') Object.assign(state.contact, action.contact)
    if (action.type === 'set-guests') {
      if (new Set(action.guests.map((g) => g.id)).size !== action.guests.length)
        fail('duplicate staying guest')
      const existingIds = new Set(original.stayingGuests.map((g) => g.id))
      const newIds = action.guests.filter((g) => !existingIds.has(g.id)).map((g) => g.id)
      if (
        newIds.length &&
        (await db.select().from(reservationGuests).where(inArray(reservationGuests.id, newIds)))
          .length
      )
        fail('guest belongs to another reservation')
      state.stayingGuests = action.guests.map((guest) => {
        if (guest.reservationRoomId && !state.lines.some((l) => l.id === guest.reservationRoomId))
          fail('guest room must belong to this reservation')
        return {
          ...guest,
          firstName: '',
          lastName: '',
          documentType: guest.documentType ?? null,
          documentNumber: guest.documentNumber ?? null,
          reservationId: state.reservation.id,
          createdAt: original.stayingGuests.find((g) => g.id === guest.id)?.createdAt ?? now,
        }
      })
    }
    if (action.type === 'set-status') {
      const line = lineFor(action.lineId)
      if (action.status === 'checked_in' && !line.roomId) fail('check-in requires an assigned room')
      line.status = action.status
      line.assignmentStart = line.checkIn
      line.actualArrival = action.status === 'confirmed' ? null : line.actualArrival
      line.actualDeparture = action.status === 'checked_out' ? line.actualDeparture : null
      if (state.lines.some((l) => l.status !== 'cancelled')) state.reservation.cancelledAt = null
    }
    if (action.type === 'edit-financial' || action.type === 'delete-financial') {
      const entry =
        state.entries.find((e) => e.id === action.entryId) ?? fail('financial entry not found')
      if (entry.voidedAt) fail('financial entry not found')
      if (entry.kind !== 'payment' && entry.kind !== 'discount' && entry.kind !== 'legacy_signed')
        fail('only payments and discounts can be edited or deleted')
      if (action.type === 'delete-financial') {
        state.entries = state.entries.filter((e) => e.id !== entry.id)
      } else {
        if (
          action.entry.kind !== entry.kind &&
          !(entry.kind === 'legacy_signed' && action.entry.kind === 'payment')
        )
          fail('financial kind cannot change')
        const index = state.entries.indexOf(entry)
        state.entries.splice(index, 1)
        addFinancial(action.entry)
        const replacement = state.entries.pop()!
        state.entries.splice(index, 0, { ...replacement, id: entry.id, createdAt: entry.createdAt })
      }
    }
    if (action.type === 'notes') state.reservation.notes = action.notes || null
    if (action.type === 'add-room') {
      if (state.lines.length >= 60) fail('reservation cannot exceed 60 rooms')
      if (state.reservation.cancelledAt) fail('reservation is cancelled')
      state.lines.push(await newLine(db, state.reservation.id, action.room, now))
    }
    if (action.type === 'edit-room') {
      const line = lineFor(action.lineId),
        room = action.room
      const nights = await price(db, room)
      const typeChanged = room.roomTypeId !== line.roomTypeId
      const saved = new Map(line.nights.map((n) => [n.date, n.priceCents]))
      line.nights = nights.map((n) => ({
        ...n,
        priceCents: !typeChanged && saved.has(n.date) ? saved.get(n.date)! : n.priceCents,
      }))
      Object.assign(line, room, { roomId: room.roomId ?? null })
      line.assignmentStart = room.checkIn
      await validateAssignment(db, line)
    }
    if (action.type === 'check-in' || action.type === 'check-out') {
      if (new Set(action.lineIds).size !== action.lineIds.length) fail('duplicate selected room')
      for (const id of action.lineIds) {
        const line = lineFor(id)
        if (action.type === 'check-in') {
          if (line.status !== 'confirmed' || !line.roomId)
            fail('check-in requires a confirmed assigned room')
          line.status = 'checked_in'
          line.actualArrival = now
        } else {
          if (line.status !== 'checked_in') fail('room is not checked in')
          line.actualDeparture = now
          line.status = 'checked_out'
        }
      }
    }
    if (action.type === 'move') {
      const line = lineFor(action.lineId)
      if (line.status !== 'checked_in') fail('only a checked-in room can move')
      if (line.roomId === action.roomId) fail('choose another room')
      line.roomId = action.roomId
      line.assignmentStart = line.checkIn
      await validateAssignment(db, line)
    }
    if (action.type === 'undo-check-in') {
      const line = lineFor(action.lineId)
      if (line.status !== 'checked_in') fail('room is not checked in')
      line.status = 'confirmed'
      line.actualArrival = null
    }
    if (action.type === 'cancel-room' || action.type === 'no-show') {
      const line = lineFor(action.lineId)
      if (action.type === 'no-show' && line.status !== 'confirmed')
        fail('only confirmed rooms can be marked no-show')
      if (action.type === 'cancel-room') {
        if (line.status === 'cancelled') fail('room already cancelled')
        if (state.lines.filter((l) => l.status !== 'cancelled').length === 1)
          fail('use whole-booking cancellation for the final room')
        if (
          action.accidental &&
          (line.status !== 'confirmed' ||
            !state.lines.some((l) => l.id !== line.id && active(l.status)))
        )
          fail('accidental removal must retain another active room')
      }
      if (line.status === 'checked_in') line.actualDeparture = now
      line.status = action.type === 'no-show' ? 'no_show' : 'cancelled'
      line.cancellationReason = action.reason || null
    }
    if (action.type === 'cancel') {
      state.reservation.cancelledAt ??= now
      for (const line of state.lines) {
        if (line.status === 'checked_in') line.actualDeparture = now
        if (line.status !== 'cancelled') line.cancellationReason = action.reason || null
        line.status = 'cancelled'
      }
    }
    if (action.type === 'financial') addFinancial(action.entry)
    if (action.type === 'correct-financial') fail('use edit-financial or delete-financial')
    const after = totals(state)
    if (after.subtotalCents - after.discountCents < before.subtotalCents - before.discountCents)
      reduceWaivers(charges(state), state.entries)
  }
  for (const line of state.lines) {
    if (line.status === 'checked_in' && !line.roomId) fail('check-in requires an assigned room')
  }
  const settlementBlocked = false
  const billableLines = state.lines.filter((line) => active(line.status))
  const datedLines = billableLines.length ? billableLines : state.lines
  state.reservation.checkIn = datedLines.reduce(
    (d, l) => (l.checkIn! < d ? l.checkIn! : d),
    datedLines[0].checkIn!,
  )
  state.reservation.checkOut = datedLines.reduce(
    (d, l) => (l.checkOut! > d ? l.checkOut! : d),
    datedLines[0].checkOut!,
  )
  return { state, settlementBlocked }
}

function lineWrites(db: Db, line: Stay, existing: boolean) {
  const { nights, ...row } = line
  const values = nights.map((n) => ({ id: crypto.randomUUID(), reservationRoomId: line.id, ...n }))
  return [
    existing
      ? db.update(reservationRooms).set(row).where(eq(reservationRooms.id, line.id))
      : db.insert(reservationRooms).values(row),
    ...(existing
      ? [
          db
            .delete(reservationRoomNights)
            .where(eq(reservationRoomNights.reservationRoomId, line.id)),
        ]
      : []),
    ...chunks(values, 20).map((v) => db.insert(reservationRoomNights).values(v)),
  ]
}
export async function execute(db: Db, id: string, command: WorkflowCommand, preview: boolean) {
  const payload = JSON.stringify(command)
  const [seen] = await db
    .select()
    .from(reservationRequests)
    .where(eq(reservationRequests.id, command.requestId))
  if (seen) {
    if (seen.reservationId !== id || seen.payload !== payload)
      throw new HttpError(409, 'request ID reused with a different payload')
    return { replayed: true, settlementBlocked: false }
  }
  const original = await loadState(db, id)
  const { state, settlementBlocked } = await plan(db, original, command.actions)
  if (preview) {
    await validateAvailability(db, state)
    return { state, settlementBlocked, replayed: false }
  }
  const now = new Date().toISOString()
  const changed = state.lines.filter(
    (l) => JSON.stringify(l) !== JSON.stringify(original.lines.find((o) => o.id === l.id)),
  )
  try {
    await runBatch(db, [
      db.insert(reservationRequests).values({
        id: command.requestId,
        reservationId: id,
        expectedVersion: original.reservation.version,
        payload,
        createdAt: now,
      }),
      // Release all revised lines inside this transaction before validating their
      // final state. This permits atomic swaps without transient overbooking.
      ...changed
        .filter((l) => original.lines.some((o) => o.id === l.id))
        .map((l) =>
          db
            .update(reservationRooms)
            .set({ status: 'cancelled' })
            .where(eq(reservationRooms.id, l.id)),
        ),
      ...changed.flatMap((l) =>
        lineWrites(
          db,
          l,
          original.lines.some((o) => o.id === l.id),
        ),
      ),
      ...original.entries
        .filter((e) => !state.entries.some((saved) => saved.id === e.id))
        .map((e) => db.delete(financialEntries).where(eq(financialEntries.id, e.id))),
      ...state.entries
        .filter(
          (e) => JSON.stringify(e) !== JSON.stringify(original.entries.find((o) => o.id === e.id)),
        )
        .map((e) =>
          original.entries.some((o) => o.id === e.id)
            ? db.update(financialEntries).set(e).where(eq(financialEntries.id, e.id))
            : db.insert(financialEntries).values(e),
        ),
      db
        .update(reservations)
        .set({
          notes: state.reservation.notes,
          checkIn: state.reservation.checkIn,
          checkOut: state.reservation.checkOut,
          cancelledAt: state.reservation.cancelledAt,
        })
        .where(eq(reservations.id, id)),
      ...(JSON.stringify(state.contact) !== JSON.stringify(original.contact)
        ? [db.update(guests).set(state.contact).where(eq(guests.id, state.contact.id))]
        : []),
      ...(JSON.stringify(state.stayingGuests) !== JSON.stringify(original.stayingGuests)
        ? [
            db.delete(reservationGuests).where(eq(reservationGuests.reservationId, id)),
            ...chunks(state.stayingGuests, 8).map((rows) =>
              db.insert(reservationGuests).values(rows),
            ),
          ]
        : []),
    ])
  } catch (error) {
    // Another copy of the same request may have committed while this one read.
    const [retry] = await db
      .select()
      .from(reservationRequests)
      .where(eq(reservationRequests.id, command.requestId))
    if (retry && retry.reservationId === id && retry.payload === payload)
      return { replayed: true, settlementBlocked: false }
    rethrowConflict(error)
  }
  return { replayed: false, settlementBlocked: false }
}

export async function createWorkflow(db: Db, input: WorkflowCreate) {
  const payload = JSON.stringify(input)
  const [seen] = await db
    .select()
    .from(reservationRequests)
    .where(eq(reservationRequests.id, input.requestId))
  if (seen) {
    if (seen.payload !== payload)
      throw new HttpError(409, 'request ID reused with a different payload')
    return seen.reservationId
  }
  const now = new Date().toISOString(),
    id = crypto.randomUUID(),
    guestId = crypto.randomUUID()
  const lines: Stay[] = []
  for (const room of input.rooms) lines.push(await newLine(db, id, room, now))
  try {
    await runBatch(db, [
      db
        .insert(guests)
        .values({ id: guestId, ...input.guest, firstName: '', lastName: '', createdAt: now }),
      db.insert(reservations).values({
        id,
        code: confirmationCode(),
        guestId,
        checkIn: lines.map((l) => l.checkIn!).sort()[0],
        checkOut: lines
          .map((l) => l.checkOut!)
          .sort()
          .at(-1)!,
        notes: input.notes,
        createdAt: now,
      }),
      db.insert(reservationRequests).values({
        id: input.requestId,
        reservationId: id,
        expectedVersion: 0,
        payload,
        createdAt: now,
      }),
      ...lines.flatMap((l) => lineWrites(db, l, false)),
    ])
  } catch (error) {
    const [retry] = await db
      .select()
      .from(reservationRequests)
      .where(eq(reservationRequests.id, input.requestId))
    if (retry && retry.payload === payload) return retry.reservationId
    if (retry) throw new HttpError(409, 'request ID reused with a different payload')
    rethrowConflict(error)
  }
  return id
}

// The preview checks the proposed aggregate. Database triggers repeat the
// availability checks under the write transaction to close the concurrency gap.
async function validateAvailability(db: Db, state: State) {
  const [otherLines, physical, closures] = await Promise.all([
    db.select().from(reservationRooms),
    db.select().from(rooms),
    db.select().from(roomClosures),
  ])
  const lines = [
    ...otherLines.filter((l) => l.reservationId !== state.reservation.id),
    ...state.lines,
  ].filter((l) => active(l.status))
  const overlap = (a: string, b: string, c: string, d: string) => a < d && b > c
  for (const line of state.lines.filter((l) => active(l.status))) {
    for (const date of requireStay(line.checkIn!, line.checkOut!)) {
      const count = lines.filter(
        (l) => l.roomTypeId === line.roomTypeId && l.checkIn! <= date && l.checkOut! > date,
      ).length
      const closed = new Set(
        closures
          .filter(
            (c) =>
              c.starts <= date &&
              c.ends > date &&
              physical.some((r) => r.id === c.roomId && r.roomTypeId === line.roomTypeId),
          )
          .map((c) => c.roomId),
      ).size
      if (count + closed > physical.filter((r) => r.roomTypeId === line.roomTypeId).length)
        throw new HttpError(409, 'no availability')
    }
    if (!line.roomId) continue
    const start = line.checkIn!
    if (
      lines.some(
        (l) =>
          l.id !== line.id &&
          l.roomId === line.roomId &&
          overlap(start, line.checkOut!, l.checkIn!, l.checkOut!),
      )
    )
      throw new HttpError(409, 'room is already assigned for those dates')
    if (
      closures.some(
        (c) => c.roomId === line.roomId && overlap(start, line.checkOut!, c.starts, c.ends),
      )
    )
      throw new HttpError(409, 'room is closed for those dates')
  }
}
