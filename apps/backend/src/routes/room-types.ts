import {
  patchRoomTypeSchema,
  rateRangeQuerySchema,
  rateWriteSchema,
  roomTypeSchema,
} from "@pms/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, runBatch } from "../db";
import { roomTypeRates, roomTypes } from "../db/schema";
import type { Env } from "../env";
import { HttpError, rethrowConflict, validate } from "../http";
import { filterWeekdays } from "../lib/dates";
import { chunks } from "../lib/chunks";
import { requireInclusiveRange } from "../rules";

export const roomTypeRoutes = new Hono<Env>();

roomTypeRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(roomTypes);
  return c.json(rows);
});

roomTypeRoutes.post("/", validate("json", roomTypeSchema), async (c) => {
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const row = {
    id: crypto.randomUUID(),
    name: body.name,
    maxAdults: body.maxAdults,
    maxChildren: body.maxChildren,
    baseRateCents: body.baseRateCents,
    createdAt: new Date().toISOString(),
  };
  try {
    await db.insert(roomTypes).values(row);
  } catch (err) {
    rethrowConflict(err);
  }
  return c.json(row, 201);
});

roomTypeRoutes.get("/:id/rates", validate("query", rateRangeQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  const dates = requireInclusiveRange(from, to, 366);
  const db = getDb(c.env.DB);
  const [type] = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, c.req.param("id")));
  if (!type) throw new HttpError(404, "room type not found");
  const overrides = await db
    .select()
    .from(roomTypeRates)
    .where(
      and(
        eq(roomTypeRates.roomTypeId, type.id),
        gte(roomTypeRates.date, from),
        lte(roomTypeRates.date, to),
      ),
    );
  const byDate = new Map(overrides.map((rate) => [rate.date, rate.priceCents]));
  return c.json({
    roomTypeId: type.id,
    baseRateCents: type.baseRateCents,
    rates: dates.map((date) => ({
      date,
      priceCents: byDate.get(date) ?? type.baseRateCents,
      override: byDate.has(date),
    })),
  });
});

roomTypeRoutes.put("/:id/rates", validate("json", rateWriteSchema), async (c) => {
  const body = c.req.valid("json");
  const dates = filterWeekdays(requireInclusiveRange(body.from, body.to, 366), body.weekdays);
  const db = getDb(c.env.DB);
  const [type] = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, c.req.param("id")));
  if (!type) throw new HttpError(404, "room type not found");
  const rows = dates.map((date) => ({
    id: crypto.randomUUID(),
    roomTypeId: type.id,
    date,
    priceCents: body.priceCents,
  }));
  await runBatch(
    db,
    chunks(rows, 20).map((chunk) =>
      db
        .insert(roomTypeRates)
        .values(chunk)
        .onConflictDoUpdate({
          target: [roomTypeRates.roomTypeId, roomTypeRates.date],
          set: { priceCents: body.priceCents },
        }),
    ),
  );
  return c.json({ updated: rows.length });
});

roomTypeRoutes.delete("/:id/rates", validate("query", rateRangeQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  requireInclusiveRange(from, to, 366);
  const db = getDb(c.env.DB);
  const [type] = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, c.req.param("id")));
  if (!type) throw new HttpError(404, "room type not found");
  const existing = await db
    .select({ id: roomTypeRates.id })
    .from(roomTypeRates)
    .where(
      and(
        eq(roomTypeRates.roomTypeId, type.id),
        gte(roomTypeRates.date, from),
        lte(roomTypeRates.date, to),
      ),
    );
  if (existing.length > 0) {
    await db
      .delete(roomTypeRates)
      .where(
        and(
          eq(roomTypeRates.roomTypeId, type.id),
          gte(roomTypeRates.date, from),
          lte(roomTypeRates.date, to),
        ),
      );
  }
  return c.json({ deleted: existing.length });
});

roomTypeRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const [type] = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, c.req.param("id")));
  if (!type) throw new HttpError(404, "room type not found");
  return c.json(type);
});

roomTypeRoutes.patch("/:id", validate("json", patchRoomTypeSchema), async (c) => {
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const [existing] = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, c.req.param("id")));
  if (!existing) throw new HttpError(404, "room type not found");
  try {
    await db.update(roomTypes).set(body).where(eq(roomTypes.id, existing.id));
  } catch (err) {
    rethrowConflict(err);
  }
  const [updated] = await db.select().from(roomTypes).where(eq(roomTypes.id, existing.id));
  return c.json(updated);
});
