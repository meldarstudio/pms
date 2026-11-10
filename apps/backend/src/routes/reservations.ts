import {
  reservationListQuerySchema,
  confirmationResendSchema,
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
import { culqiForEnv } from "../culqi";
import { getDb } from "../db";
import { guests, refunds, reservationRooms, reservations } from "../db/schema";
import type { Env } from "../env";
import { currency, HttpError, validate } from "../http";
import {
  createWorkflow,
  executeCommand,
  previewCommand,
  previewCreate,
  type CommandContext,
} from "../workflow";
import { staffConfirmationIntent } from "../confirmation-intents";
import { requestConfirmationResend } from "../confirmation-resends";
import { staffReservationAccess } from "../reservation-access";
import { loadReservations, presentReservations, readReservation } from "../reservation-read";
import { presentNight, type presentReservation } from "../present";
import { balanceCentsSql, roomCharges, stayBill, unresolvedBillSql } from "../lib/reservation-bill";

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
  if (q.refund === "due" || q.balance === "credit") filters.push(sql`${balanceCentsSql} < 0`);
  if (q.balance === "outstanding") filters.push(sql`${balanceCentsSql} > 0`);
  if (q.balance === "settled") filters.push(sql`${balanceCentsSql} = 0`);
  if (q.balance === "unresolved") filters.push(unresolvedBillSql);
  const sortKey =
    q.sort === "balance"
      ? balanceCentsSql
      : q.sort === "guestName"
        ? guests.fullName
        : q.sort === "checkOut"
          ? reservations.checkOut
          : reservations.checkIn;
  const query = db
    .select({ id: reservations.id })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(and(...filters))
    .orderBy(
      q.direction === "desc" ? desc(sortKey) : asc(sortKey),
      ...(q.sort === "guestName" ? [] : [asc(guests.fullName)]),
      asc(reservations.code),
    )
    .limit(q.limit ?? 50)
    .offset(q.offset ?? 0);
  const [rows, counts] = q.paginated
    ? await db.batch([
        query,
        db
          .select({ total: count() })
          .from(reservations)
          .innerJoin(guests, eq(guests.id, reservations.guestId))
          .where(and(...filters)),
      ])
    : [await query, [{ total: 0 }]];
  const total = counts[0].total;
  const response = (rows: (ReturnType<typeof presentReservation> & { guestName: string })[]) =>
    q.paginated ? { rows, total, limit: q.limit ?? 50, offset: q.offset ?? 0 } : rows;
  if (!rows.length) return c.json(response([]));
  const ids = rows.map((row) => row.id);
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
reservationRoutes.get("/:id/confirmation", async (c) => {
  c.header("Cache-Control", "private, no-store");
  try {
    return c.json(await staffConfirmationIntent(getDb(c.env.DB), c.req.param("id")));
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    c.header("Cache-Control", "private, no-store");
    return c.json({ error: error.message }, error.status);
  }
});
reservationRoutes.get("/:id/access", async (c) => {
  c.header("Cache-Control", "private, no-store");
  try {
    return c.json(
      await staffReservationAccess(
        getDb(c.env.DB),
        c.req.param("id"),
        c.get("propertyCalendar").today,
      ),
    );
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    c.header("Cache-Control", "private, no-store");
    return c.json({ error: error.message }, error.status);
  }
});
reservationRoutes.post(
  "/:id/confirmation/resends",
  async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  },
  validate("json", confirmationResendSchema),
  async (c) => {
    try {
      const result = await requestConfirmationResend(
        getDb(c.env.DB),
        c.req.param("id"),
        c.req.valid("json"),
        c.var.account,
        c.get("propertyCalendar").today,
      );
      return c.json(
        { work: result.work, mayDuplicateEarlierDelivery: true },
        result.replayed ? 200 : 201,
      );
    } catch (error) {
      if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
      console.error("confirmation resend command failed", c.req.param("id"));
      return c.json({ error: "internal error" }, 500);
    }
  },
);
const commandContext = (c: Context<Env>): CommandContext => {
  const { today, timeZone } = c.get("propertyCalendar");
  return { today, timeZone, account: c.var.account };
};
reservationRoutes.post("/:id/preview", validate("json", workflowCommandSchema), async (c) => {
  return c.json(
    await previewCommand(
      getDb(c.env.DB),
      c.req.param("id"),
      c.req.valid("json"),
      commandContext(c),
      currency(c),
    ),
  );
});
reservationRoutes.post("/:id/commands", validate("json", workflowCommandSchema), async (c) => {
  return c.json(
    await executeCommand(
      getDb(c.env.DB),
      c.req.param("id"),
      c.req.valid("json"),
      commandContext(c),
      { currency: currency(c), culqi: culqiForEnv(c.env) },
    ),
  );
});
