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
import { guests, refunds, reservationRooms, reservations } from "../db/schema";
import type { Env } from "../env";
import { currency, HttpError, validate } from "../http";
import { createWorkflow, execute, previewCreate, type CommandContext } from "../workflow";
import { loadReservations, presentReservations, readReservation } from "../reservation-read";
import { presentNight, type presentReservation } from "../present";
import { balanceCentsSql, roomCharges, stayBill } from "../lib/reservation-bill";

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
      guest: {
        ...getTableColumns(guests),
        id: sql<string>`${guests.id}`.as("list_guest_id"),
        revision: sql<number>`${guests.revision}`.as("list_guest_revision"),
        notes: sql<string | null>`${guests.notes}`.as("list_guest_notes"),
        createdAt: sql<string>`${guests.createdAt}`.as("list_guest_created_at"),
      },
      balanceCents: (needsBalance ? balanceCentsSql : sql<number>`0`).as("list_balance_cents"),
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
    const balanced = matches
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
  const details = await presentReservations(db, await loadReservations(db, ids), currency(c));
  return c.json(
    response(
      details.map((detail) => ({ ...detail, stayingGuests: [], guestName: detail.guest.fullName })),
    ),
  );
});
reservationRoutes.post("/", validate("json", workflowCreateSchema), async (c) => {
  const db = getDb(c.env.DB),
    id = await createWorkflow(db, c.req.valid("json"));
  return c.json(await readReservation(db, id, currency(c)), 201);
});
reservationRoutes.post("/preview", validate("json", workflowCreatePreviewSchema), async (c) => {
  const input = c.req.valid("json");
  const { terms, rooms } = await previewCreate(getDb(c.env.DB), input);
  return c.json({
    billing: {
      ...stayBill(rooms, {
        discountCents: input.discountCents ?? 0,
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
  c.json(await readReservation(getDb(c.env.DB), c.req.param("id"), currency(c))),
);
const commandContext = (c: Context<Env>): CommandContext => {
  const { today, timeZone } = c.get("propertyCalendar");
  return { today, timeZone, account: c.var.account };
};
reservationRoutes.post("/:id/preview", validate("json", workflowCommandSchema), async (c) => {
  const db = getDb(c.env.DB);
  const result = await execute(db, c.req.param("id"), c.req.valid("json"), true, commandContext(c));
  if (!result.state) return c.json({ replayed: true });
  const [billing] = await presentReservations(db, [result.state], currency(c));
  return c.json({ validation: { issues: result.issues }, billing });
});
reservationRoutes.post("/:id/commands", validate("json", workflowCommandSchema), async (c) => {
  const db = getDb(c.env.DB);
  const command = c.req.valid("json");
  const context = commandContext(c);
  if (
    !c.env.CULQI_SECRET_KEY &&
    command.actions.some((action) => action.type === "request-culqi-refund")
  )
    throw new HttpError(503, "Culqi is not configured");
  const result = await execute(db, c.req.param("id"), command, false, context);
  if (result.culqiRefunds?.length)
    await sendCulqiRefunds(
      db,
      culqiClient({ secretKey: c.env.CULQI_SECRET_KEY }),
      result.culqiRefunds,
      context,
    );
  return c.json(await readReservation(db, c.req.param("id"), currency(c)));
});
