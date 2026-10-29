import type { WorkflowAction } from "@pms/shared";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { coupons, reservationGuests, roomTypes } from "./db/schema";
import { HttpError } from "./http";
import { ratesBetween } from "./inventory";
import { refundCents, reservationBill } from "./lib/workflow-billing";
import { holdsInventory } from "./lib/statuses";
import { activeCancellation, policyCharge, presentCancellation } from "./lib/cancellation";
import { acceptedTerms, type RatePlanTerms } from "./lib/rate-plans";
import { overridesFor, priceNights } from "./lib/pricing";
import {
  couponAppliedCents,
  couponCode,
  couponIssuedCents,
  couponExpiry,
  couponQuery,
  type CouponMovement,
} from "./lib/coupons";
import { acceptPhone, requireStay } from "./rules";
import type { CommandContext, State, Stay } from "./workflow";

type Night = Stay["nights"][number];
type Action<K extends WorkflowAction["type"]> = Extract<WorkflowAction, { type: K }>;
type RefundAction = Action<
  "request-refund" | "request-culqi-refund" | "complete-refund" | "fail-refund"
>;
const requestsRefund = (
  action: RefundAction,
): action is Action<"request-refund" | "request-culqi-refund"> =>
  action.type === "request-refund" || action.type === "request-culqi-refund";
const CULQI_MIN_REFUND_CENTS = 100;

type PlanContext = CommandContext & {
  db: Db;
  original: State;
  state: State;
  now: string;
  opened: Set<string>;
  waivers: Action<"waive-cancellation-charge">[];
  refundActions: RefundAction[];
  couponActions: Action<"issue-coupon" | "redeem-coupon">[];
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
    cancellationChargeCents: cancellation ? presentCancellation(cancellation).finalChargeCents : 0,
    refunds: state.refunds,
    couponMovements: state.couponMovements,
  });
};

export async function price(
  db: Db,
  room: { roomTypeId: string; checkIn: string; checkOut: string; nightlyRateCents?: number },
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
    culqiChargeId: null,
  };
};

function changePayment(action: Action<"edit-payment" | "delete-payment">, ctx: PlanContext) {
  const { state, refundActions } = ctx;
  const index = state.payments.findIndex((payment) => payment.id === action.paymentId);
  if (index === -1) fail("payment not found");
  const payment = state.payments[index];
  if (payment.culqiChargeId) fail("Culqi payment cannot be changed");
  if (
    state.refunds.some((refund) => refund.paymentId === payment.id) ||
    refundActions.some((a) => requestsRefund(a) && a.paymentId === payment.id)
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

const queueCoupon = (
  action: Action<"issue-coupon" | "redeem-coupon">,
  { couponActions }: PlanContext,
) => {
  couponActions.push(action);
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
    if (from === "unfulfilled") fail("an unfulfilled reservation cannot change status");
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
  "request-culqi-refund": queueRefund,
  "complete-refund": queueRefund,
  "fail-refund": queueRefund,
  "issue-coupon": queueCoupon,
  "redeem-coupon": queueCoupon,
};

function dispatch(action: WorkflowAction, ctx: PlanContext) {
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
    if (requestsRefund(action)) {
      const payment =
        state.payments.find((payment) => payment.id === action.paymentId) ??
        fail("payment not found");
      const culqi = action.type === "request-culqi-refund";
      if (culqi) {
        if (!payment.culqiChargeId) fail("payment is not a Culqi payment");
        if (action.amountCents < CULQI_MIN_REFUND_CENTS)
          fail("Culqi refund must be at least 100 cents");
        if (
          state.refunds.some(
            (refund) =>
              refund.paymentId === payment.id &&
              refund.culqiChargeId &&
              refund.status === "requested",
          )
        )
          fail("a Culqi refund for this payment is pending");
      }
      state.refunds.push({
        id: crypto.randomUUID(),
        reservationId: state.reservation.id,
        paymentId: action.paymentId,
        amountCents: action.amountCents,
        method: culqi ? "card" : action.method,
        reference: culqi ? null : (action.reference ?? null),
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
        culqiChargeId: culqi ? payment.culqiChargeId : null,
        culqiRefundId: null,
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

const movement = (
  { state, account, today, now }: PlanContext,
  couponId: string,
  kind: CouponMovement["kind"],
  amountCents: number,
): CouponMovement => ({
  id: crypto.randomUUID(),
  couponId,
  reservationId: state.reservation.id,
  kind,
  amountCents,
  recordedAt: now,
  recordedOn: today,
  accountId: account.id,
  recordedBy: account.username,
});

async function redeemCoupon(action: Action<"redeem-coupon">, ctx: PlanContext) {
  const { db, state } = ctx;
  const coupon =
    state.coupons.find((coupon) => coupon.code === action.code) ??
    (await couponQuery(db).where(eq(coupons.code, action.code)))
      .map(({ coupon, issuedBy }) => ({ ...coupon, issuedBy }))
      .at(0);
  if (!coupon) throw new HttpError(404, "coupon not found");
  if (coupon.sourceReservationId === state.reservation.id)
    fail("coupon cannot be redeemed on the reservation that issued it");
  if (!holdsInventory(state.reservation.status)) fail("coupon requires an active reservation");
  if (state.couponMovements.some((m) => m.kind === "redeem" && m.couponId !== coupon.id))
    fail("reservation already uses another coupon");
  if (action.amountCents > coupon.balanceCents) fail("coupon redemption exceeds its balance");
  if (!state.coupons.includes(coupon)) state.coupons.push(coupon);
  coupon.balanceCents -= action.amountCents;
  state.couponMovements.push(movement(ctx, coupon.id, "redeem", action.amountCents));
  if (totals(state).balanceCents < 0) fail("coupon redemption exceeds the balance owed");
}

function returnCoupons(ctx: PlanContext) {
  const { state } = ctx;
  let excess = totals(state).couponAppliedCents - totals(state).totalCents;
  for (const coupon of state.coupons) {
    if (excess <= 0) return;
    const applied = couponAppliedCents(
      state.couponMovements.filter((m) => m.couponId === coupon.id),
    );
    const amountCents = Math.min(applied, excess);
    if (amountCents <= 0) continue;
    coupon.balanceCents += amountCents;
    state.couponMovements.push(movement(ctx, coupon.id, "return", amountCents));
    excess -= amountCents;
  }
}

async function applyCoupons(ctx: PlanContext) {
  const { state, couponActions, account, today, now } = ctx;
  for (const action of couponActions) {
    if (action.type === "redeem-coupon") {
      await redeemCoupon(action, ctx);
      continue;
    }
    const bill = totals(state);
    if (action.amountCents > bill.refundDueCents - bill.pendingRefundCents)
      fail("coupon exceeds the refund due");
    const id = crypto.randomUUID();
    state.coupons.push({
      id,
      revision: 0,
      code: couponCode(),
      sourceReservationId: state.reservation.id,
      valueCents: action.amountCents,
      balanceCents: action.amountCents,
      issuedAt: now,
      expiresOn: couponExpiry(today),
      accountId: account.id,
      issuedBy: account.username,
    });
    state.couponMovements.push(movement(ctx, id, "issue", action.amountCents));
  }
  const redeemed = new Set(
    state.couponMovements.flatMap((m) => (m.kind === "redeem" ? [m.couponId] : [])),
  );
  if (state.coupons.some((c) => redeemed.has(c.id) && state.reservation.checkIn > c.expiresOn))
    fail("stay starts after the coupon expires");
}

function checkCouponLocks({ original, state, couponActions }: PlanContext) {
  if (
    !holdsInventory(original.reservation.status) &&
    holdsInventory(state.reservation.status) &&
    state.couponMovements.length
  )
    fail("reservation with coupons cannot be restored");
  if (
    (couponIssuedCents(state.couponMovements) > 0 ||
      couponActions.some((action) => action.type === "issue-coupon")) &&
    original.payments.some(
      (payment) =>
        JSON.stringify(payment) !== JSON.stringify(state.payments.find((p) => p.id === payment.id)),
    )
  )
    fail("payment cannot be changed after issuing a coupon");
}

function checkRefundLimits(
  { original, state, refundActions }: PlanContext,
  actions: WorkflowAction[],
) {
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
  const resolvesOnly = actions.every(
    (action) => action.type === "complete-refund" || action.type === "fail-refund",
  );
  const requestedCents = refundCents(state.refunds, "requested");
  if (!resolvesOnly && requestedCents > 0 && -totals(state).balanceCents < requestedCents)
    fail(
      refundActions.some(requestsRefund)
        ? "refund exceeds the refund due"
        : "change leaves requested refunds above the refund due",
    );
}

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
    couponActions: [],
  };
  for (const action of actions) await dispatch(action, ctx);
  if (!ctx.state.lines.length) fail("reservation requires at least one room");
  chargeOpenedCancellation(ctx);
  applyWaivers(ctx);
  returnCoupons(ctx);
  applyRefunds(ctx);
  checkCouponLocks(ctx);
  await applyCoupons(ctx);
  checkRefundLimits(ctx, actions);
  return { state: ctx.state };
}
