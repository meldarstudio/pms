import type { WorkflowCommand, WorkflowCreate, WorkflowCreatePreview } from "@pms/shared";
import { and, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type { Culqi } from "./culqi";
import { sendCulqiRefunds } from "./culqi-refunds";
import { runBatch, type Db } from "./db";
import {
  cancellationWaivers,
  couponMovements,
  coupons,
  payments,
  paymentVoids,
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
import { peakOccupied, type GridClosure, type GridStay } from "./lib/inventory-grid";
import { holdsInventory, inventoryStatuses } from "./lib/statuses";
import { termColumns } from "./lib/rate-plans";
import { currentRatePlan } from "./rate-plan-settings";
import { acceptPhone, requireStay } from "./rules";
import { confirmationCode } from "./lib/codes";
import { chunks } from "./lib/chunks";
import { claimRevision, isStaleWrite } from "./db/revisions";
import { presentReservation } from "./present";
import {
  loadReservation,
  readReservation,
  roomLookups,
  type State,
  type Stay,
} from "./reservation-read";

type RoomType = typeof roomTypes.$inferSelect;
type Room = typeof rooms.$inferSelect;
type OccupiedRoom = Pick<Stay, "id" | "roomId"> & GridStay;
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
  const result = await execute(db, id, command, context);
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
  const original = await loadReservation(db, id);
  const { state } = await plan(db, original, command.actions, context, new Date().toISOString());
  const { checkIn, checkOut } = state.reservation;
  const [types, physical, otherLines, closures] = await db.batch([
    db.select().from(roomTypes),
    db.select().from(rooms),
    db
      .select({
        id: reservationRooms.id,
        roomTypeId: reservationRooms.roomTypeId,
        roomId: reservationRooms.roomId,
        status: reservations.status,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
      })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(
        and(
          ne(reservations.id, state.reservation.id),
          inArray(reservations.status, inventoryStatuses),
          lt(reservations.checkIn, checkOut),
          gt(reservations.checkOut, checkIn),
        ),
      ),
    db
      .select({
        roomId: roomClosures.roomId,
        roomTypeId: rooms.roomTypeId,
        starts: roomClosures.starts,
        ends: roomClosures.ends,
      })
      .from(roomClosures)
      .innerJoin(rooms, eq(rooms.id, roomClosures.roomId))
      .where(and(lt(roomClosures.starts, checkOut), gt(roomClosures.ends, checkIn))),
  ]);
  const issues = [
    ...roomIssues(changedRooms(state.lines, roomBaseline(original, state)), types, physical),
    ...(holdsInventory(state.reservation.status)
      ? availabilityIssues(state, physical, otherLines, closures)
      : []),
  ];
  const billing = presentReservation(state, roomLookups(types, physical), currency);
  return { validation: { issues }, billing };
}

async function execute(db: Db, id: string, command: WorkflowCommand, context: CommandContext) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await executeAttempt(db, id, command, context);
    } catch (error) {
      if (!isStaleWrite(error)) throw error;
    }
  }
  throw new HttpError(409, "reservation changed while saving; please try again");
}

function suspendRoomGuardsUntilFinalStatus(db: Db, id: string, expectedRevision: number) {
  return db
    .update(reservations)
    .set({
      status: "cancelled",
      revision: claimRevision(reservations.revision, expectedRevision),
    })
    .where(eq(reservations.id, id));
}

async function executeAttempt(
  db: Db,
  id: string,
  command: WorkflowCommand,
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
  const revalidateAllRooms = revalidatesAllRooms(original, state);
  rejectRoomIssues(await validateRooms(db, state.lines, roomBaseline(original, state)));
  const newMovements = state.couponMovements.filter(
    (m) => !original.couponMovements.some((o) => o.id === m.id),
  );
  const issued = new Set(newMovements.flatMap((m) => (m.kind === "issue" ? [m.couponId] : [])));
  const guestsChanged = command.actions.some((action) => action.type === "set-guests");
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
      suspendRoomGuardsUntilFinalStatus(db, id, original.reservation.revision),
      ...(guestsChanged
        ? [db.delete(reservationGuests).where(eq(reservationGuests.reservationId, id))]
        : []),
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
      ...state.payments
        .filter((p) => !original.payments.some((o) => o.id === p.id))
        .map((payment) => db.insert(payments).values(payment)),
      ...state.payments
        .flatMap((p) =>
          p.void && !original.payments.some((o) => o.id === p.id && o.void) ? [p.void] : [],
        )
        .map((voided) => db.insert(paymentVoids).values(voided)),
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
          channel: state.reservation.channel,
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
      ...(guestsChanged
        ? chunks(state.stayingGuests, 8).map((rows) => db.insert(reservationGuests).values(rows))
        : []),
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
  const terms = await currentRatePlan(db, input.ratePlan ?? "flexible");
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
        channel: input.channel,
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
  const terms = await currentRatePlan(db, input.ratePlan ?? "flexible");
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

function revalidatesAllRooms(original: State, state: State) {
  return (
    original.reservation.checkIn !== state.reservation.checkIn ||
    original.reservation.checkOut !== state.reservation.checkOut ||
    (!holdsInventory(original.reservation.status) && holdsInventory(state.reservation.status))
  );
}

function roomBaseline(original: State, state: State) {
  return revalidatesAllRooms(original, state) ? [] : original.lines;
}

function changedRooms(lines: Stay[], previousLines: Stay[]) {
  const previousById = new Map(previousLines.map((line) => [line.id, line]));
  return lines.flatMap((line, roomIndex) => {
    const previous = previousById.get(line.id);
    const unchanged =
      previous &&
      previous.roomTypeId === line.roomTypeId &&
      previous.roomId === line.roomId &&
      previous.adults === line.adults &&
      previous.children === line.children;
    return unchanged ? [] : [{ line, roomIndex }];
  });
}

async function validateRooms(
  db: Db,
  lines: Stay[],
  previousLines: Stay[] = [],
): Promise<WorkflowIssue[]> {
  const affected = changedRooms(lines, previousLines);
  if (!affected.length) return [];
  const [types, physical] = await db.batch([db.select().from(roomTypes), db.select().from(rooms)]);
  return roomIssues(affected, types, physical);
}

function roomIssues(
  affected: ReturnType<typeof changedRooms>,
  types: RoomType[],
  physical: Room[],
): WorkflowIssue[] {
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

function availabilityIssues(
  state: State,
  physical: Room[],
  otherLines: OccupiedRoom[],
  closures: GridClosure[],
) {
  const issues: WorkflowIssue[] = [];
  const { checkIn, checkOut, status } = state.reservation;
  const lines: OccupiedRoom[] = [
    ...otherLines,
    ...state.lines.map(({ id, roomTypeId, roomId }) => ({
      id,
      roomTypeId,
      roomId,
      status,
      checkIn,
      checkOut,
    })),
  ];
  const peaks = peakOccupied(requireStay(checkIn, checkOut), lines, closures);
  const overlap = (a: string, b: string, c: string, d: string) => a < d && b > c;
  for (const [roomIndex, line] of state.lines.entries()) {
    const capacity = physical.filter((r) => r.roomTypeId === line.roomTypeId).length;
    if ((peaks.get(line.roomTypeId) ?? 0) > capacity)
      issues.push({ code: "no availability", roomIndex, field: "roomTypeId" });
    if (!line.roomId) continue;
    if (
      lines.some(
        (l) =>
          l.id !== line.id &&
          l.roomId === line.roomId &&
          overlap(checkIn, checkOut, l.checkIn, l.checkOut),
      )
    )
      issues.push({ code: "room is already assigned for those dates", roomIndex, field: "roomId" });
    if (
      closures.some((c) => c.roomId === line.roomId && overlap(checkIn, checkOut, c.starts, c.ends))
    )
      issues.push({ code: "room is closed for those dates", roomIndex, field: "roomId" });
  }
  return issues;
}
