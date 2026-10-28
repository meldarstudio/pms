import type { WorkflowAction, WorkflowCommand, WorkflowCreate } from "@pms/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { runBatch, type Db } from "./db";
import {
  cancellationWaivers,
  payments,
  guests,
  refunds,
  reservationGuests,
  reservationCancellations,
  reservationRequests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomClosures,
  rooms,
  roomTypes,
  user,
} from "./db/schema";
import { HttpError, rethrowConflict } from "./http";
import { ratesBetween } from "./inventory";
import { refundCents, reservationBill } from "./lib/workflow-billing";
import type { Refund } from "./lib/refunds";
import { holdsInventory } from "./lib/statuses";
import {
  activeCancellation,
  policyCharge,
  presentCancellation,
  type Cancellation,
} from "./lib/cancellation";
import { acceptedTerms, ratePlans, termColumns } from "./lib/rate-plans";
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
  cancellations: Cancellation[];
  refunds: Refund[];
};
/** Who records a command and when, from the server, never the client. */
export type CommandContext = {
  today: string;
  timeZone: string;
  account: { id: string; username: string };
};
export type WorkflowIssue = {
  code: string;
  roomIndex: number;
  field: "roomId" | "roomTypeId" | "occupancy";
};
const fail = (message: string): never => {
  throw new HttpError(400, message);
};
export const totals = (state: State) => {
  const cancellation = activeCancellation(state.cancellations);
  return reservationBill(state.lines, state.payments, state.reservation.discountCents, {
    released: !holdsInventory(state.reservation.status),
    paymentSchedule: acceptedTerms(state.reservation).paymentSchedule,
    // Reservations cancelled before charges existed have no row and keep a zero charge.
    cancellationChargeCents: cancellation ? presentCancellation(cancellation).finalChargeCents : 0,
    refunds: state.refunds,
  });
};

export async function loadState(db: Db, id: string): Promise<State> {
  // All rows and their revisions belong to one snapshot. Separate reads can
  // mix the old reservation dates with another command's new room nights.
  const [
    parents,
    contacts,
    stayingGuests,
    lines,
    nightRows,
    paymentRows,
    cancellationRows,
    waiverRows,
    refundRows,
  ] = await db.batch([
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
    cancellationQuery(db).where(eq(reservationCancellations.reservationId, id)),
    waiverQuery(db).where(eq(reservationCancellations.reservationId, id)),
    refundQuery(db).where(eq(refunds.reservationId, id)),
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
    cancellations: withWaivers(cancellationRows, waiverRows),
    refunds: refundRows.map(withAccounts),
  };
}

const cancellationQuery = (db: Db) =>
  db
    .select({ cancellation: reservationCancellations, recordedBy: user.username })
    .from(reservationCancellations)
    .leftJoin(user, eq(user.id, reservationCancellations.accountId));
const waiverQuery = (db: Db) =>
  db
    .select({ waiver: cancellationWaivers, recordedBy: user.username })
    .from(cancellationWaivers)
    .innerJoin(
      reservationCancellations,
      eq(reservationCancellations.id, cancellationWaivers.cancellationId),
    )
    .leftJoin(user, eq(user.id, cancellationWaivers.accountId));
const requester = alias(user, "refund_requester");
const resolver = alias(user, "refund_resolver");
const refundQuery = (db: Db) =>
  db
    // D1 batches return objects keyed by column name, so both usernames need their own.
    .select({
      refund: refunds,
      requestedBy: sql<string | null>`${requester.username}`.as("refund_requested_by"),
      resolvedBy: sql<string | null>`${resolver.username}`.as("refund_resolved_by"),
    })
    .from(refunds)
    .leftJoin(requester, eq(requester.id, refunds.requestedAccountId))
    .leftJoin(resolver, eq(resolver.id, refunds.resolvedAccountId));
const withAccounts = ({
  refund,
  requestedBy,
  resolvedBy,
}: Awaited<ReturnType<typeof refundQuery>>[number]): Refund => ({
  ...refund,
  requestedBy,
  resolvedBy,
});

/** Every refund of the given reservations, for list reads. */
export async function refundsFor(db: Db, reservationIds: string[]) {
  return (await refundQuery(db).where(inArray(refunds.reservationId, reservationIds))).map(
    withAccounts,
  );
}
type CancellationRow = Awaited<ReturnType<typeof cancellationQuery>>[number];
type WaiverRow = Awaited<ReturnType<typeof waiverQuery>>[number];

function withWaivers(cancellations: CancellationRow[], waivers: WaiverRow[]): Cancellation[] {
  return cancellations.map(({ cancellation, recordedBy }) => ({
    ...cancellation,
    recordedBy,
    waivers: waivers
      .filter(({ waiver }) => waiver.cancellationId === cancellation.id)
      .map(({ waiver, recordedBy }) => ({ ...waiver, recordedBy })),
  }));
}

/** Every cancellation of the given reservations, with its waivers, for list reads. */
export async function cancellationsFor(db: Db, reservationIds: string[]) {
  const [cancellations, waivers] = await db.batch([
    cancellationQuery(db).where(inArray(reservationCancellations.reservationId, reservationIds)),
    waiverQuery(db).where(inArray(reservationCancellations.reservationId, reservationIds)),
  ]);
  return withWaivers(cancellations, waivers);
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
  { today, timeZone, account }: CommandContext,
  now = new Date().toISOString(),
) {
  const state = structuredClone(original);
  // Cancellations and no-shows opened by this command are charged once its stay changes apply.
  const opened = new Set<string>();
  const waivers: Extract<WorkflowAction, { type: "waive-cancellation-charge" }>[] = [];
  // Refunds are checked against the command's final bill, after its charges apply.
  const refundActions: Extract<
    WorkflowAction,
    { type: "request-refund" | "complete-refund" | "fail-refund" }
  >[] = [];

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
      const from = state.reservation.status;
      // A guest who arrived is not a no-show; a no-show is restored before it is cancelled.
      if (action.status === "no_show" && from !== "confirmed" && from !== "no_show")
        fail("only a confirmed reservation can be marked no-show");
      if (action.status === "cancelled" && from === "no_show")
        fail("restore the no-show reservation before cancelling it");
      if (!holdsInventory(action.status) && holdsInventory(from)) {
        const id = crypto.randomUUID();
        opened.add(id);
        state.cancellations.push({
          id,
          reservationId: state.reservation.id,
          outcome: action.status,
          recordedAt: now,
          freeUntil: null,
          policyChargeCents: 0,
          accountId: account.id,
          recordedBy: account.username,
          restoredAt: null,
          waivers: [],
        });
      }
      if (holdsInventory(action.status) && !holdsInventory(from)) {
        // Restoration keeps the charge and its waivers as inactive history.
        const cancellation = activeCancellation(state.cancellations);
        if (cancellation && opened.has(cancellation.id))
          state.cancellations = state.cancellations.filter((c) => c !== cancellation);
        else if (cancellation) cancellation.restoredAt = now;
      }
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
      if (state.refunds.some((refund) => refund.paymentId === payment.id))
        fail("payment with refunds cannot be changed");
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
    if (action.type === "waive-cancellation-charge") waivers.push(action);
    if (
      action.type === "request-refund" ||
      action.type === "complete-refund" ||
      action.type === "fail-refund"
    )
      refundActions.push(action);
  }
  if (!state.lines.length) fail("reservation requires at least one room");
  const cancellation = activeCancellation(state.cancellations);
  if (cancellation && opened.has(cancellation.id))
    Object.assign(
      cancellation,
      policyCharge({
        outcome: cancellation.outcome,
        rooms: state.lines,
        discountCents: state.reservation.discountCents,
        terms: acceptedTerms(state.reservation),
        checkIn: state.reservation.checkIn,
        now,
        timeZone,
      }),
    );
  if (waivers.length) {
    if (!cancellation || holdsInventory(state.reservation.status))
      fail("reservation has no active cancellation");
    for (const waiver of waivers)
      cancellation!.waivers.push({
        id: crypto.randomUUID(),
        cancellationId: cancellation!.id,
        amountCents: waiver.amountCents,
        reason: waiver.reason,
        recordedAt: now,
        accountId: account.id,
        recordedBy: account.username,
      });
    if (presentCancellation(cancellation!).finalChargeCents < 0)
      fail("waiver cannot exceed the cancellation charge");
  }
  for (const action of refundActions) {
    if (action.type === "request-refund") {
      if (!state.payments.some((payment) => payment.id === action.paymentId))
        fail("payment not found");
      state.refunds.push({
        id: crypto.randomUUID(),
        reservationId: state.reservation.id,
        paymentId: action.paymentId,
        amountCents: action.amountCents,
        method: action.method,
        reference: action.reference ?? null,
        reason: action.reason,
        status: "requested",
        requestedAt: now,
        requestedAccountId: account.id,
        requestedBy: account.username,
        resolvedAt: null,
        resolvedAccountId: null,
        resolvedBy: null,
        refundDate: null,
        completionReference: null,
        failureReason: null,
      });
      continue;
    }
    const refund =
      state.refunds.find((refund) => refund.id === action.refundId) ?? fail("refund not found");
    if (refund.status !== "requested") fail("refund is already resolved");
    if (action.type === "complete-refund" && action.refundDate > today)
      fail("refund date cannot be in the future");
    Object.assign(refund, {
      status: action.type === "complete-refund" ? "completed" : "failed",
      resolvedAt: now,
      resolvedAccountId: account.id,
      resolvedBy: account.username,
      ...(action.type === "complete-refund"
        ? {
            refundDate: action.refundDate,
            completionReference: action.reference,
          }
        : { failureReason: action.reason }),
    });
  }
  // A restoration cannot undo any refund activity, failed or requested in this
  // command included; staff use a new reservation.
  if (
    !holdsInventory(original.reservation.status) &&
    holdsInventory(state.reservation.status) &&
    state.refunds.length
  )
    fail("reservation with refunds cannot be restored");
  for (const payment of state.payments) {
    const paymentRefunds = state.refunds.filter((refund) => refund.paymentId === payment.id);
    if (
      refundCents(paymentRefunds, "completed") + refundCents(paymentRefunds, "requested") >
      payment.amountCents
    )
      fail("refund exceeds the payment's remaining amount");
  }
  // Requested refunds never exceed the refund due. Completing or failing a request
  // keeps that true, so recording money already returned is never refused; any
  // other change must leave room for the requests still open.
  const resolvesOnly = actions.every(
    (action) => action.type === "complete-refund" || action.type === "fail-refund",
  );
  const requestedCents = refundCents(state.refunds, "requested");
  if (!resolvesOnly && requestedCents > 0 && -totals(state).balanceCents < requestedCents)
    fail(
      refundActions.some((action) => action.type === "request-refund")
        ? "refund exceeds the refund due"
        : "change leaves requested refunds above the refund due",
    );
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
  context: CommandContext,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await executeAttempt(db, id, command, preview, context);
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
  context: CommandContext,
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
  const now = new Date().toISOString();
  const { state } = await plan(db, original, command.actions, context, now);
  const revalidateAllRooms =
    original.reservation.checkIn !== state.reservation.checkIn ||
    original.reservation.checkOut !== state.reservation.checkOut ||
    (!holdsInventory(original.reservation.status) && holdsInventory(state.reservation.status));
  const roomIssues = await validateRooms(db, state.lines, revalidateAllRooms ? [] : original.lines);
  if (preview) {
    const issues = [...roomIssues, ...(await validateAvailability(db, state))];
    return { state, issues, replayed: false };
  }
  rejectRoomIssues(roomIssues);
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
      // Restore before opening a cancellation: one reservation has one active cancellation.
      ...state.cancellations
        .filter((c) =>
          original.cancellations.some((o) => o.id === c.id && o.restoredAt !== c.restoredAt),
        )
        .map((c) =>
          db
            .update(reservationCancellations)
            .set({ restoredAt: c.restoredAt })
            .where(
              and(
                eq(reservationCancellations.id, c.id),
                isNull(reservationCancellations.restoredAt),
              ),
            ),
        ),
      ...state.cancellations
        .filter((c) => !original.cancellations.some((o) => o.id === c.id))
        // Inserts write only table columns, not the presented account or waivers.
        .map((c) => db.insert(reservationCancellations).values(c)),
      ...state.cancellations
        .flatMap((c) => c.waivers)
        .filter((w) => !original.cancellations.some((o) => o.waivers.some((ow) => ow.id === w.id)))
        .map((w) => db.insert(cancellationWaivers).values(w)),
      // Inserts and updates write only table columns, not the presented accounts.
      ...state.refunds
        .filter(
          (r) => JSON.stringify(r) !== JSON.stringify(original.refunds.find((o) => o.id === r.id)),
        )
        .map((r) =>
          original.refunds.some((o) => o.id === r.id)
            ? db.update(refunds).set(r).where(eq(refunds.id, r.id))
            : db.insert(refunds).values(r),
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
        // Staff creation offers only Flexible until plan selection exists.
        ...termColumns(ratePlans.flexible),
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
  ].filter((l) => holdsInventory(l.status));
  const overlap = (a: string, b: string, c: string, d: string) => a < d && b > c;
  for (const [roomIndex, line] of state.lines.entries()) {
    if (!holdsInventory(state.reservation.status)) break;
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
