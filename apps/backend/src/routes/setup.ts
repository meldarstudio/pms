import { propertySetupSchema } from "@pms/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, runBatch } from "../db";
import { roomTypes, rooms } from "../db/schema";
import type { Env } from "../env";
import { HttpError, rethrowConflict, validate } from "../http";
import { chunks } from "../lib/chunks";

export const setupRoutes = new Hono<Env>();

setupRoutes.post("/", validate("json", propertySetupSchema), async (c) => {
  const body = c.req.valid("json");
  const numbers = new Set<string>();
  for (const [index, room] of body.rooms.entries()) {
    if (numbers.has(room.number))
      throw new HttpError(409, "room number already exists", `rooms[${index}].number`);
    numbers.add(room.number);
  }
  const db = getDb(c.env.DB);
  const [existing] = body.roomTypeId
    ? await db.select().from(roomTypes).where(eq(roomTypes.id, body.roomTypeId))
    : [];
  if (body.roomTypeId && !existing) throw new HttpError(404, "room type not found");
  const roomType = {
    id: existing?.id ?? crypto.randomUUID(),
    name: body.name,
    maxOccupancy: body.maxOccupancy,
    baseRateCents: body.baseRateCents,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const existingRooms = existing
    ? await db.select().from(rooms).where(eq(rooms.roomTypeId, existing.id))
    : [];
  const ownedIds = new Set(existingRooms.map((room) => room.id));
  for (const room of body.rooms) {
    if (room.id && !ownedIds.has(room.id)) throw new HttpError(404, "room not found");
  }
  const savedRooms = body.rooms.map((room) => ({
    id: room.id ?? crypto.randomUUID(),
    number: room.number,
    roomTypeId: roomType.id,
  }));
  const editedRooms = savedRooms.filter((room) => ownedIds.has(room.id));
  try {
    await runBatch(db, [
      existing
        ? db
            .update(roomTypes)
            .set({
              name: body.name,
              maxOccupancy: body.maxOccupancy,
              baseRateCents: body.baseRateCents,
            })
            .where(eq(roomTypes.id, existing.id))
        : db.insert(roomTypes).values(roomType),
      // Release existing numbers inside the transaction so valid final numbers,
      // including swaps, do not collide with another room's previous number.
      // These temporary values exceed the public room-number length limit.
      ...editedRooms.map((room) =>
        db
          .update(rooms)
          .set({
            // A moved room must abort the batch, not silently skip its edit.
            // As with reservation revision guards, NULL fails a NOT NULL column.
            number: sql`CASE WHEN ${rooms.roomTypeId} = ${roomType.id} THEN ${`__setup_${crypto.randomUUID()}`} ELSE NULL END`,
          })
          .where(eq(rooms.id, room.id)),
      ),
      ...editedRooms.map((room) =>
        db.update(rooms).set({ number: room.number }).where(eq(rooms.id, room.id)),
      ),
      ...chunks(
        savedRooms.filter((room) => !ownedIds.has(room.id)),
        20,
      ).map((rows) => db.insert(rooms).values(rows)),
    ]);
  } catch (error) {
    try {
      rethrowConflict(error);
    } catch (conflict) {
      if (!(conflict instanceof HttpError) || conflict.message !== "room number already exists")
        throw conflict;
      const current = await db.select().from(rooms);
      const index = body.rooms.findIndex((room) =>
        current.some((existing) => existing.number === room.number && existing.id !== room.id),
      );
      if (index < 0) throw conflict;
      throw new HttpError(409, conflict.message, `rooms[${index}].number`);
    }
  }
  const updatedRooms = await db.select().from(rooms).where(eq(rooms.roomTypeId, roomType.id));
  return c.json({ roomType, rooms: updatedRooms }, existing ? 200 : 201);
});
