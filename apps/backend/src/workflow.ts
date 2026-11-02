import type { WorkflowCommand, WorkflowCreate, WorkflowCreatePreview } from "@pms/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Culqi } from "./culqi";
import { sendCulqiRefunds } from "./culqi-refunds";
import { runBatch, type Db } from "./db";
import {
  cancellationWaivers,
  couponMovements,
  coupons,
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
} from "./db/schema";
import { HttpError, rethrowConflict } from "./http";
import { holdsInventory } from "./lib/statuses";
import { ratePlans, termColumns } from "./lib/rate-plans";
import { acceptPhone, requireStay } from "./rules";
import { confirmationCode } from "./lib/codes";
import { chunks } from "./lib/chunks";
import { claimRevision, isStaleWrite } from "./db/revisions";
import {
  loadReservation,
  presentReservations,
  readReservation,
  type State,
  type Stay,
} from "./reservation-read";
import { plan, priceRooms, stayLine } from "./workflow-plan";

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
export function lineWrites(db: Db, line: Stay, existing: boolean) {
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
export async function executeCommand(
  db: Db,
  id: string,
  command: WorkflowCommand,
  context: CommandContext,
  options: { currency: string; culqi: Culqi },
) {
  if (
    !options.culqi.configured &&
    command.actions.some((action) => action.type === "request-culqi-refund")
  )
    throw new HttpError(503, "Culqi is not configured");
  const result = await execute(db, id, command, false, context);
  if (result.culqiRefunds?.length)
    await sendCulqiRefunds(db, options.culqi, result.culqiRefunds, context);
  return readReservation(db, id, options.currency);
}

export async function previewCommand(
  db: Db,
  id: string,
  command: WorkflowCommand,
  context: CommandContext,
  currency: string,
) {
  const result = await execute(db, id, command, true, context);
  if (!result.state) return { replayed: true };
  const [billing] = await presentReservations(db, [result.state], currency);
  return { validation: { issues: result.issues }, billing };
}

async function execute(
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
  const original = await loadReservation(db, id);
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
  const newMovements = state.couponMovements.filter(
    (m) => !original.couponMovements.some((o) => o.id === m.id),
  );
  const issued = new Set(newMovements.flatMap((m) => (m.kind === "issue" ? [m.couponId] : [])));
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
        .map((c) => db.insert(reservationCancellations).values(c)),
      ...state.cancellations
        .flatMap((c) => c.waivers)
        .filter((w) => !original.cancellations.some((o) => o.waivers.some((ow) => ow.id === w.id)))
        .map((w) => db.insert(cancellationWaivers).values(w)),
      ...state.refunds
        .filter(
          (r) => JSON.stringify(r) !== JSON.stringify(original.refunds.find((o) => o.id === r.id)),
        )
        .map((r) =>
          original.refunds.some((o) => o.id === r.id)
            ? db.update(refunds).set(r).where(eq(refunds.id, r.id))
            : db.insert(refunds).values(r),
        ),
      ...state.coupons.filter((c) => issued.has(c.id)).map((c) => db.insert(coupons).values(c)),
      ...state.coupons
        .filter(
          (c) =>
            !issued.has(c.id) &&
            original.coupons.find((o) => o.id === c.id)?.balanceCents !== c.balanceCents,
        )
        .map((c) =>
          db
            .update(coupons)
            .set({
              balanceCents: c.balanceCents,
              revision: claimRevision(coupons.revision, c.revision),
            })
            .where(eq(coupons.id, c.id)),
        ),
      ...newMovements.map((m) => db.insert(couponMovements).values(m)),
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
    const [retry] = await db
      .select()
      .from(reservationRequests)
      .where(eq(reservationRequests.id, command.requestId));
    if (retry && retry.reservationId === id && retry.payload === payload) return { replayed: true };
    rethrowConflict(error);
  }
  const culqiRefunds = state.refunds.filter(
    (refund) => refund.culqiChargeId && !original.refunds.some((o) => o.id === refund.id),
  );
  return { replayed: false, culqiRefunds };
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
  const terms = ratePlans[input.ratePlan ?? "flexible"];
  const nights = await priceRooms(db, input, input.rooms, terms);
  const lines = input.rooms.map((room, index) => stayLine(id, room, now, nights[index]));
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
        ...termColumns(terms),
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

export async function previewCreate(db: Db, input: WorkflowCreatePreview) {
  const terms = ratePlans[input.ratePlan ?? "flexible"];
  const nights = await priceRooms(db, input, input.rooms, terms);
  const rooms = input.rooms.map((room, index) => ({
    roomTypeId: room.roomTypeId,
    nights: nights[index],
  }));
  return { terms, rooms };
}

function rejectRoomIssues(issues: WorkflowIssue[]) {
  const issue = issues[0];
  if (!issue) return;
  const field = `rooms[${issue.roomIndex}]${issue.field === "occupancy" ? "" : `.${issue.field}`}`;
  throw new HttpError(issue.code === "room not found" ? 404 : 400, issue.code, field);
}

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
