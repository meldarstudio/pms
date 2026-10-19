import {
  reservationListQuerySchema,
  workflowCommandSchema,
  workflowCreateSchema,
} from "@pms/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  like,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import {
  payments,
  guests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomTypes,
  rooms,
} from "../db/schema";
import type { Env } from "../env";
import { currency, validate } from "../http";
import { reservationDetail } from "../load";
import { createWorkflow, execute, totals } from "../workflow";
import { chunks } from "../lib/chunks";
import { presentReservation } from "../present";
import { bill } from "../lib/workflow-billing";

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
  const needsBalance = q.balance !== undefined || q.sort === "balance";
  const query = db
    .select({
      reservation: reservations,
      guest: guests,
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
    // Keep the authoritative billing policy in bill(), shared with detail and workflow reads.
    const balanced = matches
      .map((row) => {
        const { reservation, subtotalCents, paidCents } = row;
        const cancelled = reservation.status === "cancelled";
        const { balanceCents } = bill(
          cancelled ? 0 : subtotalCents,
          [{ amountCents: paidCents }],
          reservation.discountCents,
          { cancelled },
        );
        return { ...row, balanceCents };
      })
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
  const [lines, paymentRows, types, roomRows] = await Promise.all([
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
reservationRoutes.get("/:id", async (c) =>
  c.json(await reservationDetail(getDb(c.env.DB), c.req.param("id"), currency(c))),
);
reservationRoutes.post("/:id/preview", validate("json", workflowCommandSchema), async (c) => {
  const result = await execute(
    getDb(c.env.DB),
    c.req.param("id"),
    c.req.valid("json"),
    true,
    c.get("propertyCalendar").today,
  );
  if (!result.state) return c.json({ replayed: true });
  const bill = totals(result.state);
  return c.json({
    validation: { issues: result.issues },
    billing: {
      ...bill,
      status: result.state.reservation.status,
      checkIn: result.state.reservation.checkIn,
      checkOut: result.state.reservation.checkOut,
      savedDiscountCents: result.state.reservation.discountCents,
      rooms: result.state.lines.map((line) => {
        const subtotalCents = line.nights.reduce((sum, night) => sum + night.priceCents, 0);
        return {
          ...line,
          subtotalCents,
          discountCents: 0,
          totalCents: result.state!.reservation.status === "cancelled" ? 0 : subtotalCents,
        };
      }),
      payments: result.state.payments,
    },
  });
});
reservationRoutes.post("/:id/commands", validate("json", workflowCommandSchema), async (c) => {
  const db = getDb(c.env.DB);
  await execute(db, c.req.param("id"), c.req.valid("json"), false, c.get("propertyCalendar").today);
  return c.json(await reservationDetail(db, c.req.param("id"), currency(c)));
});
