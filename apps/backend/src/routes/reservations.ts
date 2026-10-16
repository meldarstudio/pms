import {
  reservationListQuerySchema,
  workflowCommandSchema,
  workflowCreateSchema,
} from "@pms/shared";
import { and, asc, eq, gt, inArray, like, lte, or } from "drizzle-orm";
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

export const reservationRoutes = new Hono<Env>();
reservationRoutes.get("/", validate("query", reservationListQuerySchema), async (c) => {
  const q = c.req.valid("query"),
    db = getDb(c.env.DB);
  const filters = [];
  if (q.guestId) filters.push(eq(reservations.guestId, q.guestId));
  if (q.checkIn) filters.push(eq(reservations.checkIn, q.checkIn));
  if (q.from) filters.push(gt(reservations.checkOut, q.from));
  if (q.to) filters.push(lte(reservations.checkIn, q.to));
  if (q.status) filters.push(eq(reservations.status, q.status));
  if (q.q) {
    for (const token of q.q.split(/\s+/)) {
      const needle = token.replace(/[%_]/g, "");
      // Skip a token that was only LIKE wildcards so it cannot match every row.
      if (!needle) continue;
      const pattern = `%${needle}%`;
      filters.push(or(like(reservations.code, pattern), like(guests.fullName, pattern)));
    }
  }
  const rows = await db
    .select({ reservation: reservations, guest: guests })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(and(...filters))
    .orderBy(asc(reservations.checkIn), asc(guests.fullName), asc(reservations.code))
    .limit(q.limit ?? 50)
    .offset(q.offset ?? 0);
  if (!rows.length) return c.json([]);
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
  const result = await execute(getDb(c.env.DB), c.req.param("id"), c.req.valid("json"), true);
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
  await execute(db, c.req.param("id"), c.req.valid("json"), false);
  return c.json(await reservationDetail(db, c.req.param("id"), currency(c)));
});
