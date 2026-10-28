import {
  reservationListQuerySchema,
  workflowCommandSchema,
  workflowCreatePreviewSchema,
  workflowCreateSchema,
} from "@pms/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  inArray,
  isNull,
  like,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
import { Hono, type Context } from "hono";
import { culqiClient } from "../culqi";
import { sendCulqiRefunds } from "../culqi-refunds";
import { getDb } from "../db";
import {
  cancellationWaivers,
  payments,
  guests,
  refunds,
  reservationCancellations,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomTypes,
  rooms,
} from "../db/schema";
import type { Env } from "../env";
import { currency, HttpError, validate } from "../http";
import { reservationDetail } from "../load";
import { holdsInventory } from "../lib/statuses";
import {
  cancellationsFor,
  createWorkflow,
  execute,
  previewCreate,
  refundsFor,
  totals,
  type CommandContext,
} from "../workflow";
import { cancellationFields } from "../lib/cancellation";
import { presentRefunds } from "../lib/refunds";
import { chunks } from "../lib/chunks";
import { presentNight, presentReservation } from "../present";
import { bill, reservationBill, roomCharges } from "../lib/workflow-billing";
import { acceptedTerms } from "../lib/rate-plans";

export const reservationRoutes = new Hono<Env>();
reservationRoutes.get("/", validate("query", reservationListQuerySchema), async (c) => {
  const q = c.req.valid("query"),
    db = getDb(c.env.DB);
  const filters = [];
  if (q.guestId) filters.push(eq(reservations.guestId, q.guestId));
  if (q.checkIn) filters.push(eq(reservations.checkIn, q.checkIn));
  if (q.checkOut) filters.push(eq(reservations.checkOut, q.checkOut));
  if (q.from) filters.push(gt(reservations.checkOut, q.from));
  if (q.to) filters.push(lte(reservations.checkIn, q.to));
  if (q.status) filters.push(eq(reservations.status, q.status));
  if (q.statuses) filters.push(inArray(reservations.status, q.statuses));
  if (q.assignment) {
    const unassigned = exists(
      db
        .select({ id: reservationRooms.id })
        .from(reservationRooms)
        .where(
          and(eq(reservationRooms.reservationId, reservations.id), isNull(reservationRooms.roomId)),
        ),
    );
    filters.push(q.assignment === "unassigned" ? unassigned : not(unassigned));
  }
  if (q.refund === "requested")
    filters.push(
      exists(
        db
          .select({ id: refunds.id })
          .from(refunds)
          .where(and(eq(refunds.reservationId, reservations.id), eq(refunds.status, "requested"))),
      ),
    );
  if (q.q) {
    for (const token of q.q.split(/\s+/)) {
      const needle = token.replace(/[%_]/g, "");
      // Skip a token that was only LIKE wildcards so it cannot match every row.
      if (!needle) continue;
      const pattern = `%${needle}%`;
      filters.push(or(like(reservations.code, pattern), like(guests.fullName, pattern)));
    }
  }
  const sortColumn =
    q.sort === "guestName" || q.sort === "balance"
      ? guests.fullName
      : q.sort === "checkOut"
        ? reservations.checkOut
        : reservations.checkIn;
  const primaryOrder =
    q.direction === "desc" && q.sort !== "balance" ? desc(sortColumn) : asc(sortColumn);
  const needsBalance = q.balance !== undefined || q.sort === "balance" || q.refund === "due";
  const query = db
    .select({
      reservation: reservations,
      // D1 batches return objects, so shared column names must be unique before
      // Drizzle maps values back to the nested reservation/contact fields.
      guest: {
        ...getTableColumns(guests),
        id: sql<string>`${guests.id}`.as("list_guest_id"),
        revision: sql<number>`${guests.revision}`.as("list_guest_revision"),
        notes: sql<string | null>`${guests.notes}`.as("list_guest_notes"),
        createdAt: sql<string>`${guests.createdAt}`.as("list_guest_created_at"),
      },
      // Aggregate each one-to-many relation independently; joining payments to nights inflates both.
      subtotalCents: (needsBalance
        ? sql<number>`coalesce((
        select sum(${reservationRoomNights.priceCents}) from ${reservationRooms}
        inner join ${reservationRoomNights} on ${reservationRoomNights.reservationRoomId} = ${reservationRooms.id}
        where ${reservationRooms.reservationId} = ${reservations.id}
      ), 0)`
        : sql<number>`0`
      ).as("list_subtotal_cents"),
      paidCents: (needsBalance
        ? sql<number>`coalesce((
        select sum(${payments.amountCents}) from ${payments}
        where ${payments.reservationId} = ${reservations.id}
      ), 0)`
        : sql<number>`0`
      ).as("list_paid_cents"),
      refundedCents: (needsBalance
        ? sql<number>`coalesce((
        select sum(${refunds.amountCents}) from ${refunds}
        where ${refunds.reservationId} = ${reservations.id} and ${refunds.status} = 'completed'
      ), 0)`
        : sql<number>`0`
      ).as("list_refunded_cents"),
      // The active cancellation or no-show's final charge; restored and legacy cancellations charge nothing.
      cancellationChargeCents: (needsBalance
        ? sql<number>`coalesce((
        select ${reservationCancellations.policyChargeCents} - coalesce((
          select sum(${cancellationWaivers.amountCents}) from ${cancellationWaivers}
          where ${cancellationWaivers.cancellationId} = ${reservationCancellations.id}
        ), 0) from ${reservationCancellations}
        where ${reservationCancellations.reservationId} = ${reservations.id}
          and ${reservationCancellations.restoredAt} is null
      ), 0)`
        : sql<number>`0`
      ).as("list_cancellation_charge_cents"),
    })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(and(...filters))
    .orderBy(
      primaryOrder,
      ...(q.sort === "guestName" || q.sort === "balance" ? [] : [asc(guests.fullName)]),
      asc(reservations.code),
    )
    .$dynamic();
  if (!needsBalance) query.limit(q.limit ?? 50).offset(q.offset ?? 0);
  const [matches, counts] =
    q.paginated && !needsBalance
      ? await db.batch([
          query,
          db
            .select({ total: count() })
            .from(reservations)
            .innerJoin(guests, eq(guests.id, reservations.guestId))
            .where(and(...filters)),
        ])
      : [await query, [{ total: 0 }]];
  let rows = matches;
  let total = counts[0].total;
  if (needsBalance) {
    // Keep the authoritative billing policy in bill(), which reservationBill applies to every read.
    const balanced = matches
      .map((row) => {
        const { reservation, subtotalCents, paidCents, refundedCents, cancellationChargeCents } =
          row;
        const released = !holdsInventory(reservation.status);
        const { balanceCents } = bill(
          released ? cancellationChargeCents : subtotalCents,
          [{ amountCents: paidCents }],
          reservation.discountCents,
          { released, refundedCents },
        );
        return { ...row, balanceCents };
      })
      // Refund due is the credit: net money retained beyond the final charge.
      .filter(({ balanceCents }) => q.refund !== "due" || balanceCents < 0)
      .filter(({ balanceCents }) => {
        return q.balance === "outstanding"
          ? balanceCents > 0
          : q.balance === "settled"
            ? balanceCents === 0
            : q.balance === "credit"
              ? balanceCents < 0
              : true;
      });
    // Stable numeric sorting preserves the SQL name/code tie-breakers in both directions.
    if (q.sort === "balance")
      balanced.sort(
        (a, b) => (q.direction === "desc" ? -1 : 1) * (a.balanceCents - b.balanceCents),
      );
    total = balanced.length;
    rows = balanced.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 50));
  }
  const response = (rows: (ReturnType<typeof presentReservation> & { guestName: string })[]) =>
    q.paginated ? { rows, total, limit: q.limit ?? 50, offset: q.offset ?? 0 } : rows;
  if (!rows.length) return c.json(response([]));
  const ids = rows.map((r) => r.reservation.id);
  const [lines, paymentRows, types, roomRows, cancellationRows, refundRows] = await Promise.all([
    Promise.all(
      chunks(ids, 80).map((ids) =>
        db.select().from(reservationRooms).where(inArray(reservationRooms.reservationId, ids)),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunks(ids, 80).map((ids) =>
        db.select().from(payments).where(inArray(payments.reservationId, ids)),
      ),
    ).then((r) => r.flat()),
    db.select().from(roomTypes),
    db.select().from(rooms),
    Promise.all(chunks(ids, 80).map((ids) => cancellationsFor(db, ids))).then((r) => r.flat()),
    Promise.all(chunks(ids, 80).map((ids) => refundsFor(db, ids))).then((r) => r.flat()),
  ]);
  const nights = (
    await Promise.all(
      chunks(
        lines.map((l) => l.id),
        80,
      ).map((ids) =>
        db
          .select()
          .from(reservationRoomNights)
          .where(inArray(reservationRoomNights.reservationRoomId, ids)),
      ),
    )
  ).flat();
  return c.json(
    response(
      rows.map(({ reservation, guest }) => {
        const ownLines = lines.filter((l) => l.reservationId === reservation.id);
        const ownIds = new Set(ownLines.map((l) => l.id));
        const detail = presentReservation({
          reservation,
          guest,
          lines: ownLines,
          nights: nights.filter((n) => ownIds.has(n.reservationRoomId)),
          payments: paymentRows.filter((payment) => payment.reservationId === reservation.id),
          cancellations: cancellationRows.filter((row) => row.reservationId === reservation.id),
          refunds: refundRows.filter((row) => row.reservationId === reservation.id),
          types,
          roomRows,
          currency: currency(c),
        });
        return { ...detail, guestName: `${guest.fullName}` };
      }),
    ),
  );
});
reservationRoutes.post("/", validate("json", workflowCreateSchema), async (c) => {
  const db = getDb(c.env.DB),
    id = await createWorkflow(db, c.req.valid("json"));
  return c.json(await reservationDetail(db, id, currency(c)), 201);
});
// Prices a new reservation under its plan; it neither validates availability nor saves.
reservationRoutes.post("/preview", validate("json", workflowCreatePreviewSchema), async (c) => {
  const input = c.req.valid("json");
  const { terms, rooms } = await previewCreate(getDb(c.env.DB), input);
  return c.json({
    billing: {
      ...reservationBill(rooms, [], input.discountCents ?? 0, {
        released: false,
        paymentSchedule: terms.paymentSchedule,
      }),
      ratePlan: terms,
      currency: currency(c),
      rooms: rooms.map((room) => ({
        roomTypeId: room.roomTypeId,
        ...roomCharges(room, false),
        nights: room.nights.map(presentNight),
      })),
    },
  });
});
reservationRoutes.get("/:id", async (c) =>
  c.json(await reservationDetail(getDb(c.env.DB), c.req.param("id"), currency(c))),
);
const commandContext = (c: Context<Env>): CommandContext => {
  const { today, timeZone } = c.get("propertyCalendar");
  return { today, timeZone, account: c.var.account };
};
reservationRoutes.post("/:id/preview", validate("json", workflowCommandSchema), async (c) => {
  const result = await execute(
    getDb(c.env.DB),
    c.req.param("id"),
    c.req.valid("json"),
    true,
    commandContext(c),
  );
  if (!result.state) return c.json({ replayed: true });
  const bill = totals(result.state);
  return c.json({
    validation: { issues: result.issues },
    billing: {
      ...bill,
      ...cancellationFields(result.state.cancellations),
      ratePlan: acceptedTerms(result.state.reservation),
      status: result.state.reservation.status,
      checkIn: result.state.reservation.checkIn,
      checkOut: result.state.reservation.checkOut,
      savedDiscountCents: result.state.reservation.discountCents,
      rooms: result.state.lines.map((line) => ({
        ...line,
        ...roomCharges(line, !holdsInventory(result.state!.reservation.status)),
        nights: line.nights.map(presentNight),
      })),
      payments: result.state.payments,
      refunds: presentRefunds(result.state.refunds),
    },
  });
});
reservationRoutes.post("/:id/commands", validate("json", workflowCommandSchema), async (c) => {
  const db = getDb(c.env.DB);
  const command = c.req.valid("json");
  const context = commandContext(c);
  // Refuse before saving a request that could never reach Culqi.
  if (
    !c.env.CULQI_SECRET_KEY &&
    command.actions.some((action) => action.type === "request-culqi-refund")
  )
    throw new HttpError(503, "Culqi is not configured");
  const result = await execute(db, c.req.param("id"), command, false, context);
  // A replayed command sent its refunds when it first committed.
  if (result.culqiRefunds?.length)
    await sendCulqiRefunds(
      db,
      culqiClient({ secretKey: c.env.CULQI_SECRET_KEY }),
      result.culqiRefunds,
      context,
    );
  return c.json(await reservationDetail(db, c.req.param("id"), currency(c)));
});
