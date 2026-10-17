import { propertySetupSchema } from "@pms/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, runBatch } from "../db";
import { roomTypes, rooms } from "../db/schema";
import type { Env } from "../env";
import { HttpError, rethrowConflict, validate } from "../http";
import { chunks } from "../lib/chunks";

export const setupRoutes = new Hono<Env>();

setupRoutes.post("/", validate("json", propertySetupSchema), async (c) => {
  const body = c.req.valid("json");
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
      ...savedRooms
        .filter((room) => ownedIds.has(room.id))
        .map((room) =>
          db
            .update(rooms)
            .set({ number: room.number })
            .where(and(eq(rooms.id, room.id), eq(rooms.roomTypeId, roomType.id))),
        ),
      ...chunks(
        savedRooms.filter((room) => !ownedIds.has(room.id)),
        20,
      ).map((rows) => db.insert(rooms).values(rows)),
    ]);
  } catch (error) {
    rethrowConflict(error);
  }
  const updatedRooms = await db.select().from(rooms).where(eq(rooms.roomTypeId, roomType.id));
  return c.json({ roomType, rooms: updatedRooms }, existing ? 200 : 201);
});
