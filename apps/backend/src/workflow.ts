import type { WorkflowAction, WorkflowCommand, WorkflowCreate } from "@pms/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import {
  payments,
  guests,
  reservationGuests,
  reservationRequests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomClosures,
  rooms,
  roomTypes,
} from "./db/schema";
import { HttpError, rethrowConflict } from "./http";
import { ratesBetween } from "./inventory";
import { bill } from "./lib/workflow-billing";
import { quoteNights, overridesFor } from "./lib/quote";
import { acceptPhone, requireStay } from "./rules";
import { confirmationCode } from "./lib/codes";
import { chunks } from "./lib/chunks";
import { claimRevision, isStaleWrite } from "./db/revisions";

type Night = { date: string; priceCents: number };
export type Stay = typeof reservationRooms.$inferSelect & { nights: Night[] };
export type State = {
  reservation: typeof reservations.$inferSelect;
  contact: typeof guests.$inferSelect;
  stayingGuests: (typeof reservationGuests.$inferSelect)[];
  lines: Stay[];
  payments: (typeof payments.$inferSelect)[];
};
export type WorkflowIssue = {
  code: string;
  roomIndex: number;
  field: "roomId" | "roomTypeId" | "occupancy";
};
const active = (s: string) => ["confirmed", "checked_in", "checked_out"].includes(s);
const fail = (message: string): never => {
  throw new HttpError(400, message);
};
export const charges = (state: State) =>
  (state.reservation.status === "cancelled" ? [] : state.lines).reduce(
    (sum, l) => sum + l.nights.reduce((s, n) => s + n.priceCents, 0),
    0,
  );
export const totals = (state: State) =>
  bill(charges(state), state.payments, state.reservation.discountCents, {
    cancelled: state.reservation.status === "cancelled",
  });

export async function loadState(db: Db, id: string): Promise<State> {
  // All rows and their revisions belong to one snapshot. Separate reads can
  // mix the old reservation dates with another command's new room nights.
  const [parents, contacts, stayingGuests, lines, nightRows, paymentRows] = await db.batch([
    db.select().from(reservations).where(eq(reservations.id, id)),
    db
      .select({ contact: guests })
      .from(guests)
      .innerJoin(reservations, eq(reservations.guestId, guests.id))
      .where(eq(reservations.id, id)),
    db.select().from(reservationGuests).where(eq(reservationGuests.reservationId, id)),
    db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id)),
    db
      .select({ night: reservationRoomNights })
      .from(reservationRoomNights)
      .innerJoin(reservationRooms, eq(reservationRooms.id, reservationRoomNights.reservationRoomId))
      .where(eq(reservationRooms.reservationId, id)),
    db.select().from(payments).where(eq(payments.reservationId, id)),
  ]);
  const reservation = parents[0];
  if (!reservation) throw new HttpError(404, "reservation not found");
  const contact = contacts[0]?.contact;
  if (!contact) throw new HttpError(404, "guest not found");
  const nights = nightRows.map(({ night }) => night);
  return {
    reservation,
    contact,
    stayingGuests,
    lines: lines.map((l) => ({
      ...l,
      nights: nights
        .filter((n) => n.reservationRoomId === l.id)
        .map((n) => ({ date: n.date, priceCents: n.priceCents })),
    })),
    payments: paymentRows,
  };
}

async function price(
  db: Db,
  room: {
    roomTypeId: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    nightlyRateCents?: number;
  },
) {
  const dates = requireStay(room.checkIn, room.checkOut);
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, room.roomTypeId));
  if (!type) throw new HttpError(404, "room type not found");
  const rates = await ratesBetween(db, [type.id], room.checkIn, room.checkOut);
  return quoteNights(
    dates,
    type.baseRateCents,
    overridesFor(rates, type.id),
    room.nightlyRateCents,
  );
}
async function newLine(
  db: Db,
  id: string,
  room: Extract<WorkflowAction, { type: "add-room" }>["room"],
  now: string,
  dates: { checkIn: string; checkOut: string },
): Promise<Stay> {
  const nights = await price(db, { ...room, ...dates });
  const line: Stay = {
    id: crypto.randomUUID(),
    reservationId: id,
    roomTypeId: room.roomTypeId,
    roomId: room.roomId ?? null,
    adults: room.adults,
    children: room.children,
    createdAt: now,
    nights,
  };
  return line;
}

export async function plan(
  db: Db,
  original: State,
  actions: WorkflowAction[],
  today: string,
  now = new Date().toISOString(),
) {
  const state = structuredClone(original);

  const lineFor = (id: string) =>
    state.lines.find((l) => l.id === id) ?? fail("room line not found");
  const newPayment = (input: Extract<WorkflowAction, { type: "add-payment" }>["payment"]) => {
    if (input.paymentDate > today) fail("payment date cannot be in the future");
    return {
      id: crypto.randomUUID(),
      reservationId: state.reservation.id,
      amountCents: input.amountCents,
      method: input.method,
      paymentDate: input.paymentDate,
      reference: input.reference?.trim().toUpperCase() || null,
      notes: input.notes ?? null,
      createdAt: now,
    };
  };
  for (const action of actions) {
    if (action.type === "contact")
      Object.assign(state.contact, {
        ...action.contact,
        phone: acceptPhone(action.contact.phone, original.contact.phone),
      });
    if (action.type === "set-guests") {
      if (new Set(action.guests.map((g) => g.id)).size !== action.guests.length)
        fail("duplicate staying guest");
      const existingIds = new Set(original.stayingGuests.map((g) => g.id));
      const newIds = action.guests.filter((g) => !existingIds.has(g.id)).map((g) => g.id);
      if (
        newIds.length &&
        (await db.select().from(reservationGuests).where(inArray(reservationGuests.id, newIds)))
          .length
      )
        fail("guest belongs to another reservation");
      state.stayingGuests = action.guests.map((guest) => {
        if (guest.reservationRoomId && !state.lines.some((l) => l.id === guest.reservationRoomId))
          fail("guest room must belong to this reservation");
        const saved = original.stayingGuests.find((g) => g.id === guest.id);
        return {
          ...guest,
          phone: acceptPhone(guest.phone, saved?.phone),
          documentType: guest.documentType ?? null,
          documentNumber: guest.documentNumber ?? null,
          reservationId: state.reservation.id,
          createdAt: saved?.createdAt ?? now,
        };
      });
    }
    if (action.type === "set-status") {
      Object.assign(state.reservation, {
        status: action.status,
        cancelledAt: action.status === "cancelled" ? (state.reservation.cancelledAt ?? now) : null,
        cancellationReason: action.status === "cancelled" ? action.reason || null : null,
      });
    }
    if (action.type === "dates") {
      requireStay(action.checkIn, action.checkOut);
      Object.assign(state.reservation, { checkIn: action.checkIn, checkOut: action.checkOut });
      for (const line of state.lines) {
        const saved = new Map(line.nights.map((n) => [n.date, n.priceCents]));
        line.nights = (await price(db, { ...line, ...state.reservation })).map((n) => ({
          ...n,
          priceCents: saved.get(n.date) ?? n.priceCents,
        }));
      }
    }
    if (action.type === "remove-room") {
      lineFor(action.lineId);
      state.lines = state.lines.filter((line) => line.id !== action.lineId);
      for (const guest of state.stayingGuests) {
        if (guest.reservationRoomId === action.lineId) guest.reservationRoomId = null;
      }
    }
    if (action.type === "edit-payment" || action.type === "delete-payment") {
      const index = state.payments.findIndex((payment) => payment.id === action.paymentId);
      if (index === -1) fail("payment not found");
      const payment = state.payments[index];
      if (action.type === "delete-payment") {
        state.payments.splice(index, 1);
      } else {
        state.payments[index] = {
          ...newPayment(action.payment),
          id: payment.id,
          createdAt: payment.createdAt,
        };
      }
    }
    if (action.type === "set-discount") state.reservation.discountCents = action.amountCents;
    if (action.type === "notes") state.reservation.notes = action.notes || null;
    if (action.type === "add-room") {
      if (state.lines.length >= 60) fail("reservation cannot exceed 60 rooms");
      state.lines.push(
        await newLine(db, state.reservation.id, action.room, now, state.reservation),
      );
    }
    if (action.type === "edit-room") {
      const line = lineFor(action.lineId),
        room = action.room;
      const nights = await price(db, { ...room, ...state.reservation });
      const typeChanged = room.roomTypeId !== line.roomTypeId;
      const saved = new Map(line.nights.map((n) => [n.date, n.priceCents]));
      line.nights = nights.map((n) => ({
        ...n,
        priceCents: !typeChanged && saved.has(n.date) ? saved.get(n.date)! : n.priceCents,
      }));
      Object.assign(line, room, { roomId: room.roomId ?? null });
    }
    if (action.type === "add-payment") state.payments.push(newPayment(action.payment));
  }
  if (!state.lines.length) fail("reservation requires at least one room");
  return { state };
}

function lineWrites(db: Db, line: Stay, existing: boolean) {
  const { nights, ...row } = line;
  const values = nights.map((n) => ({ id: crypto.randomUUID(), reservationRoomId: line.id, ...n }));
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
  ];
}
export async function execute(
  db: Db,
  id: string,
  command: WorkflowCommand,
  preview: boolean,
  today: string,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await executeAttempt(db, id, command, preview, today);
    } catch (error) {
      if (!isStaleWrite(error)) throw error;
    }
  }
  throw new HttpError(409, "reservation changed while saving; please try again");
}

async function executeAttempt(
  db: Db,
  id: string,
  command: WorkflowCommand,
  preview: boolean,
  today: string,
) {
  const payload = JSON.stringify(command);
  const [seen] = await db
    .select()
    .from(reservationRequests)
    .where(eq(reservationRequests.id, command.requestId));
  if (seen) {
    if (seen.reservationId !== id || seen.payload !== payload)
      throw new HttpError(409, "request ID reused with a different payload");
    return { replayed: true };
  }
  const original = await loadState(db, id);
  const { state } = await plan(db, original, command.actions, today);
  const revalidateAllRooms =
    original.reservation.checkIn !== state.reservation.checkIn ||
    original.reservation.checkOut !== state.reservation.checkOut ||
    (!active(original.reservation.status) && active(state.reservation.status));
  const roomIssues = await validateRooms(db, state.lines, revalidateAllRooms ? [] : original.lines);
  if (preview) {
    const issues = [...roomIssues, ...(await validateAvailability(db, state))];
    return { state, issues, replayed: false };
  }
  rejectRoomIssues(roomIssues);
  const now = new Date().toISOString();
  const changed = state.lines.filter(
    (l) => JSON.stringify(l) !== JSON.stringify(original.lines.find((o) => o.id === l.id)),
  );
  try {
    await runBatch(db, [
      db.insert(reservationRequests).values({
        id: command.requestId,
        reservationId: id,
        payload,
        createdAt: now,
      }),
      // Release the reservation inside the transaction so room swaps are atomic.
      db
        .update(reservations)
        .set({
          status: "cancelled",
          revision: claimRevision(reservations.revision, original.reservation.revision),
        })
        .where(eq(reservations.id, id)),
      db.delete(reservationGuests).where(eq(reservationGuests.reservationId, id)),
      ...original.lines
        .filter((line) => !state.lines.some((saved) => saved.id === line.id))
        .flatMap((line) => [
          db
            .delete(reservationRoomNights)
            .where(eq(reservationRoomNights.reservationRoomId, line.id)),
          db.delete(reservationRooms).where(eq(reservationRooms.id, line.id)),
        ]),
      ...changed.flatMap((l) =>
        lineWrites(
          db,
          l,
          original.lines.some((o) => o.id === l.id),
        ),
      ),
      ...original.payments
        .filter((e) => !state.payments.some((saved) => saved.id === e.id))
        .map((e) => db.delete(payments).where(eq(payments.id, e.id))),
      ...state.payments
        .filter(
          (e) => JSON.stringify(e) !== JSON.stringify(original.payments.find((o) => o.id === e.id)),
        )
        .map((e) =>
          original.payments.some((o) => o.id === e.id)
            ? db.update(payments).set(e).where(eq(payments.id, e.id))
            : db.insert(payments).values(e),
        ),
      // Restoration and changed dates must pass the room-validity triggers
      // against current room types, even when every saved room is unchanged.
      // Decide this from the original state, not the temporary cancelled status:
      // ordinary saves must still allow grandfathered unchanged occupancy.
      ...(revalidateAllRooms
        ? [
            db
              .update(reservationRooms)
              .set({ roomTypeId: sql`${reservationRooms.roomTypeId}` })
              .where(eq(reservationRooms.reservationId, id)),
          ]
        : []),
      db
        .update(reservations)
        .set({
          status: state.reservation.status,
          cancellationReason: state.reservation.cancellationReason,
          notes: state.reservation.notes,
          checkIn: state.reservation.checkIn,
          checkOut: state.reservation.checkOut,
          cancelledAt: state.reservation.cancelledAt,
          discountCents: state.reservation.discountCents,
        })
        .where(eq(reservations.id, id)),
      ...(command.actions.some((action) => action.type === "contact")
        ? [
            db
              .update(guests)
              .set({
                ...state.contact,
                revision: claimRevision(guests.revision, original.contact.revision),
              })
              .where(eq(guests.id, state.contact.id)),
          ]
        : []),
      ...chunks(state.stayingGuests, 8).map((rows) => db.insert(reservationGuests).values(rows)),
    ]);
  } catch (error) {
    // Another copy of the same request may have committed while this one read.
    const [retry] = await db
      .select()
      .from(reservationRequests)
      .where(eq(reservationRequests.id, command.requestId));
    if (retry && retry.reservationId === id && retry.payload === payload) return { replayed: true };
    rethrowConflict(error);
  }
  return { replayed: false };
}

export async function createWorkflow(db: Db, input: WorkflowCreate) {
  const payload = JSON.stringify(input);
  const [seen] = await db
    .select()
    .from(reservationRequests)
    .where(eq(reservationRequests.id, input.requestId));
  if (seen) {
    if (seen.payload !== payload)
      throw new HttpError(409, "request ID reused with a different payload");
    return seen.reservationId;
  }
  const now = new Date().toISOString(),
    id = crypto.randomUUID(),
    guestId = crypto.randomUUID();
  const phone = acceptPhone(input.guest.phone);
  const lines: Stay[] = [];
  for (const room of input.rooms) lines.push(await newLine(db, id, room, now, input));
  rejectRoomIssues(await validateRooms(db, lines));
  try {
    await runBatch(db, [
      db.insert(guests).values({ id: guestId, ...input.guest, phone, createdAt: now }),
      db.insert(reservations).values({
        id,
        code: confirmationCode(),
        guestId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        notes: input.notes,
        discountCents: input.discountCents ?? 0,
        createdAt: now,
      }),
      db.insert(reservationRequests).values({
        id: input.requestId,
        reservationId: id,
        payload,
        createdAt: now,
      }),
      ...lines.flatMap((l) => lineWrites(db, l, false)),
    ]);
  } catch (error) {
    const [retry] = await db
      .select()
      .from(reservationRequests)
      .where(eq(reservationRequests.id, input.requestId));
    if (retry && retry.payload === payload) return retry.reservationId;
    if (retry) throw new HttpError(409, "request ID reused with a different payload");
    rethrowConflict(error);
  }
  return id;
}

function rejectRoomIssues(issues: WorkflowIssue[]) {
  const issue = issues[0];
  if (issue) throw new HttpError(issue.code === "room not found" ? 404 : 400, issue.code);
}

// Validate added or edited rooms against current rules. Unchanged saved rooms
// must not block payments or cancellation after a room type's capacity changes.
// A new stay period or restoration to inventory revalidates every room.
async function validateRooms(
  db: Db,
  lines: Stay[],
  previousLines: Stay[] = [],
): Promise<WorkflowIssue[]> {
  const previousById = new Map(previousLines.map((line) => [line.id, line]));
  const affected = lines.flatMap((line, roomIndex) => {
    const previous = previousById.get(line.id);
    const unchanged =
      previous &&
      previous.roomTypeId === line.roomTypeId &&
      previous.roomId === line.roomId &&
      previous.adults === line.adults &&
      previous.children === line.children;
    return unchanged ? [] : [{ line, roomIndex }];
  });
  if (!affected.length) return [];
  const [types, physical] = await Promise.all([
    db.select().from(roomTypes),
    db.select().from(rooms),
  ]);
  const issues: WorkflowIssue[] = [];
  affected.forEach(({ line, roomIndex }) => {
    const type = types.find((type) => type.id === line.roomTypeId);
    if (type && (line.adults > type.maxAdults || line.children > type.maxChildren))
      issues.push({ code: "too many guests for this room type", roomIndex, field: "occupancy" });
    if (!line.roomId) return;
    const room = physical.find((room) => room.id === line.roomId);
    if (!room) issues.push({ code: "room not found", roomIndex, field: "roomId" });
    else if (room.roomTypeId !== line.roomTypeId)
      issues.push({ code: "room is a different type", roomIndex, field: "roomId" });
  });
  return issues;
}

// Database triggers repeat availability checks under the write transaction to
// close the concurrency gap. Preview reports all affected rooms without writing.
async function validateAvailability(db: Db, state: State) {
  const issues: WorkflowIssue[] = [];
  const [otherLines, physical, closures] = await Promise.all([
    db
      .select({ line: reservationRooms, reservation: reservations })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId)),
    db.select().from(rooms),
    db.select().from(roomClosures),
  ]);
  const lines = [
    ...otherLines
      .filter((l) => l.reservation.id !== state.reservation.id)
      .map(({ line, reservation }) => ({
        ...line,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        status: reservation.status,
      })),
    ...state.lines.map((line) => ({
      ...line,
      checkIn: state.reservation.checkIn,
      checkOut: state.reservation.checkOut,
      status: state.reservation.status,
    })),
  ].filter((l) => active(l.status));
  const overlap = (a: string, b: string, c: string, d: string) => a < d && b > c;
  for (const [roomIndex, line] of state.lines.entries()) {
    if (!active(state.reservation.status)) break;
    const checkIn = state.reservation.checkIn;
    const checkOut = state.reservation.checkOut;
    for (const date of requireStay(checkIn, checkOut)) {
      const count = lines.filter(
        (l) => l.roomTypeId === line.roomTypeId && l.checkIn! <= date && l.checkOut! > date,
      ).length;
      const closed = new Set(
        closures
          .filter(
            (c) =>
              c.starts <= date &&
              c.ends > date &&
              physical.some((r) => r.id === c.roomId && r.roomTypeId === line.roomTypeId),
          )
          .map((c) => c.roomId),
      ).size;
      if (count + closed > physical.filter((r) => r.roomTypeId === line.roomTypeId).length) {
        issues.push({ code: "no availability", roomIndex, field: "roomTypeId" });
        break;
      }
    }
    if (!line.roomId) continue;
    const start = checkIn;
    if (
      lines.some(
        (l) =>
          l.id !== line.id &&
          l.roomId === line.roomId &&
          overlap(start, checkOut, l.checkIn!, l.checkOut!),
      )
    )
      issues.push({ code: "room is already assigned for those dates", roomIndex, field: "roomId" });
    if (
      closures.some((c) => c.roomId === line.roomId && overlap(start, checkOut, c.starts, c.ends))
    )
      issues.push({ code: "room is closed for those dates", roomIndex, field: "roomId" });
  }
  return issues;
}
