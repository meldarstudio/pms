import { patchRoomSchema, roomListQuerySchema, roomSchema } from "@pms/shared";
import { and, eq, gt, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, runBatch } from "../db";
import {
  propertyWriteContext,
  reservationRooms,
  reservations,
  roomTypes,
  rooms,
} from "../db/schema";
import type { Env } from "../env";
import { HttpError, rethrowConflict, validate } from "../http";
import { inventoryStatuses } from "../lib/statuses";

export const roomRoutes = new Hono<Env>();

roomRoutes.get("/", validate("query", roomListQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(rooms)
    .where(query.roomTypeId ? eq(rooms.roomTypeId, query.roomTypeId) : undefined);
  return c.json(rows);
});

roomRoutes.post("/", validate("json", roomSchema), async (c) => {
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, body.roomTypeId));
  if (!type) throw new HttpError(404, "room type not found");
  const row = {
    id: crypto.randomUUID(),
    number: body.number,
    roomTypeId: body.roomTypeId,
  };
  try {
    await db.insert(rooms).values(row);
  } catch (err) {
    rethrowConflict(err);
  }
  return c.json(row, 201);
});

roomRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, c.req.param("id")));
  if (!room) throw new HttpError(404, "room not found");
  return c.json(room);
});

roomRoutes.patch("/:id", validate("json", patchRoomSchema), async (c) => {
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, c.req.param("id")));
  if (!room) throw new HttpError(404, "room not found");
  if (body.roomTypeId && body.roomTypeId !== room.roomTypeId) {
    const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, body.roomTypeId));
    if (!type) throw new HttpError(404, "room type not found");
    const [stay] = await db
      .select({ id: reservationRooms.id })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(
        and(
          eq(reservationRooms.roomId, room.id),
          inArray(reservations.status, inventoryStatuses),
          gt(reservations.checkOut, c.get("propertyCalendar").today),
        ),
      )
      .limit(1);
    if (stay) throw new HttpError(409, "room has an assigned stay");
  }
  try {
    await runBatch(db, [
      db
        .insert(propertyWriteContext)
        .values({ id: 1, propertyDate: c.get("propertyCalendar").today }),
      db.update(rooms).set(body).where(eq(rooms.id, room.id)),
      db.delete(propertyWriteContext),
    ]);
  } catch (err) {
    rethrowConflict(err);
  }
  const [updated] = await db.select().from(rooms).where(eq(rooms.id, room.id));
  return c.json(updated);
});
