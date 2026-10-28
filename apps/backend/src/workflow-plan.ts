import type { WorkflowAction } from "@pms/shared";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { reservationGuests, roomTypes } from "./db/schema";
import { HttpError } from "./http";
import { ratesBetween } from "./inventory";
import { refundCents, reservationBill } from "./lib/workflow-billing";
import { holdsInventory } from "./lib/statuses";
import { activeCancellation, policyCharge, presentCancellation } from "./lib/cancellation";
import { acceptedTerms, type RatePlanTerms } from "./lib/rate-plans";
import { overridesFor, priceNights } from "./lib/pricing";
import { acceptPhone, requireStay } from "./rules";
import type { CommandContext, State, Stay } from "./workflow";

type Night = Stay["nights"][number];
type Action<K extends WorkflowAction["type"]> = Extract<WorkflowAction, { type: K }>;
type RefundAction = Action<"request-refund" | "complete-refund" | "fail-refund">;

/** Everything one `plan` call shares between its handlers and finalization steps. */
type PlanContext = CommandContext & {
  db: Db;
  original: State;
  state: State;
  now: string;
  // Cancellations and no-shows opened by this command are charged once its stay changes apply.
  opened: Set<string>;
  waivers: Action<"waive-cancellation-charge">[];
  // Refunds are checked against the command's final bill, after its charges apply.
  refundActions: RefundAction[];
};

type Handlers = {
  [K in WorkflowAction["type"]]: (action: Action<K>, ctx: PlanContext) => void | Promise<void>;
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
  terms: RatePlanTerms,
): Promise<Night[]> {
  const dates = requireStay(room.checkIn, room.checkOut);
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, room.roomTypeId));
  if (!type) throw new HttpError(404, "room type not found");
  const rates = await ratesBetween(db, [type.id], room.checkIn, room.checkOut);
  return priceNights({
    dates,
    baseRateCents: type.baseRateCents,
    overrides: overridesFor(rates, type.id),
    terms,
    flatRateCents: room.nightlyRateCents,
  });
}
export async function newLine(
  db: Db,
  id: string,
  room: Action<"add-room">["room"],
  now: string,
  dates: { checkIn: string; checkOut: string },
  terms: RatePlanTerms,
): Promise<Stay> {
  const nights = await price(db, { ...room, ...dates }, terms);
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

const lineFor = ({ state }: PlanContext, id: string) =>
  state.lines.find((l) => l.id === id) ?? fail("room line not found");
const newPayment = (
  { state, today, now }: PlanContext,
  input: Action<"add-payment">["payment"],
) => {
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

function changePayment(action: Action<"edit-payment" | "delete-payment">, ctx: PlanContext) {
  const { state, refundActions } = ctx;
  const index = state.payments.findIndex((payment) => payment.id === action.paymentId);
  if (index === -1) fail("payment not found");
  const payment = state.payments[index];
  // Refund requests apply after the loop, so check the ones queued earlier in this command too.
  if (
    state.refunds.some((refund) => refund.paymentId === payment.id) ||
    refundActions.some((a) => a.type === "request-refund" && a.paymentId === payment.id)
  )
    fail("payment with refunds cannot be changed");
  if (action.type === "delete-payment") {
    state.payments.splice(index, 1);
  } else {
    state.payments[index] = {
      ...newPayment(ctx, action.payment),
      id: payment.id,
      createdAt: payment.createdAt,
    };
  }
}

const queueRefund = (action: RefundAction, { refundActions }: PlanContext) => {
  refundActions.push(action);
};

const handlers: Handlers = {
  contact(action, { state, original }) {
    Object.assign(state.contact, {
      ...action.contact,
      phone: acceptPhone(action.contact.phone, original.contact.phone),
    });
  },
  async "set-guests"(action, { db, state, original, now }) {
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
  },
  "set-status"(action, { state, opened, account, now }) {
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
  },
  async dates(action, { db, state }) {
    requireStay(action.checkIn, action.checkOut);
    Object.assign(state.reservation, { checkIn: action.checkIn, checkOut: action.checkOut });
    for (const line of state.lines) {
      const saved = new Map(line.nights.map((n) => [n.date, n]));
      line.nights = (
        await price(db, { ...line, ...state.reservation }, acceptedTerms(state.reservation))
      ).map((n) => saved.get(n.date) ?? n);
    }
  },
  "remove-room"(action, ctx) {
    const { state } = ctx;
    lineFor(ctx, action.lineId);
    state.lines = state.lines.filter((line) => line.id !== action.lineId);
    for (const guest of state.stayingGuests) {
      if (guest.reservationRoomId === action.lineId) guest.reservationRoomId = null;
    }
  },
  "edit-payment": changePayment,
  "delete-payment": changePayment,
  "set-discount"(action, { state }) {
    state.reservation.discountCents = action.amountCents;
  },
  notes(action, { state }) {
    state.reservation.notes = action.notes || null;
  },
  async "add-room"(action, { db, state, now }) {
    if (state.lines.length >= 60) fail("reservation cannot exceed 60 rooms");
    state.lines.push(
      await newLine(
        db,
        state.reservation.id,
        action.room,
        now,
        state.reservation,
        acceptedTerms(state.reservation),
      ),
    );
  },
  async "edit-room"(action, ctx) {
    const { db, state } = ctx;
    const line = lineFor(ctx, action.lineId),
      room = action.room;
    const nights = await price(
      db,
      { ...room, ...state.reservation },
      acceptedTerms(state.reservation),
    );
    const typeChanged = room.roomTypeId !== line.roomTypeId;
    const saved = new Map(line.nights.map((n) => [n.date, n]));
    line.nights = nights.map((n) => (typeChanged ? n : (saved.get(n.date) ?? n)));
    Object.assign(line, room, { roomId: room.roomId ?? null });
  },
  "add-payment"(action, ctx) {
    ctx.state.payments.push(newPayment(ctx, action.payment));
  },
  "waive-cancellation-charge"(action, { waivers }) {
    waivers.push(action);
  },
  "request-refund": queueRefund,
  "complete-refund": queueRefund,
  "fail-refund": queueRefund,
};

function dispatch(action: WorkflowAction, ctx: PlanContext) {
  // TypeScript cannot narrow the table entry to the action's own type.
  const handler = handlers[action.type] as (
    action: WorkflowAction,
    ctx: PlanContext,
  ) => void | Promise<void>;
  return handler(action, ctx);
}

function chargeOpenedCancellation({ state, opened, now, timeZone }: PlanContext) {
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
}

function applyWaivers({ state, waivers, account, now }: PlanContext) {
  if (!waivers.length) return;
  const cancellation = activeCancellation(state.cancellations);
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

function applyRefunds({ state, refundActions, account, today, now }: PlanContext) {
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
}

function checkRefundLimits(
  { original, state, refundActions }: PlanContext,
  actions: WorkflowAction[],
) {
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
}

/**
 * Applies a command's actions to a copy of the saved state, in memory. Ordinary
 * actions apply in order; waivers and refunds are collected and applied after
 * them, against the command's final stay and charge.
 */
export async function plan(
  db: Db,
  original: State,
  actions: WorkflowAction[],
  context: CommandContext,
  now = new Date().toISOString(),
) {
  const ctx: PlanContext = {
    ...context,
    db,
    original,
    state: structuredClone(original),
    now,
    opened: new Set(),
    waivers: [],
    refundActions: [],
  };
  for (const action of actions) await dispatch(action, ctx);
  if (!ctx.state.lines.length) fail("reservation requires at least one room");
  chargeOpenedCancellation(ctx);
  applyWaivers(ctx);
  applyRefunds(ctx);
  checkRefundLimits(ctx, actions);
  return { state: ctx.state };
}
