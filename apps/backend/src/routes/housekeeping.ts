import { housekeepingMarksSchema } from "@pms/shared";
import { and, eq, gt, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, runBatch } from "../db";
import { reservationRooms, reservations, roomClosures, roomTypes, rooms } from "../db/schema";
import type { Env } from "../env";
import { HttpError, validate } from "../http";
import { chunks } from "../lib/chunks";

export const housekeepingRoutes = new Hono<Env>();

// One read of every room for the property date. Today's stays come from
// reservations; the housekeeping status is only what staff last marked.
housekeepingRoutes.get("/", async (c) => {
  const today = c.get("propertyCalendar").today;
  const db = getDb(c.env.DB);
  const [roomRows, stays, closures] = await Promise.all([
    db
      .select({
        id: rooms.id,
        number: rooms.number,
        roomTypeId: rooms.roomTypeId,
        roomTypeName: roomTypes.name,
        housekeepingStatus: rooms.housekeepingStatus,
        housekeepingChangedAt: rooms.housekeepingChangedAt,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId)),
    db
      .select({
        roomId: reservationRooms.roomId,
        status: reservations.status,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
      })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(
        and(
          isNotNull(reservationRooms.roomId),
          inArray(reservations.status, ["confirmed", "checked_in"]),
          lte(reservations.checkIn, today),
          gte(reservations.checkOut, today),
        ),
      ),
    db
      .select({ roomId: roomClosures.roomId })
      .from(roomClosures)
      .where(and(lte(roomClosures.starts, today), gt(roomClosures.ends, today))),
  ]);
  const closed = new Set(closures.map((closure) => closure.roomId));
  const staysByRoom = new Map<string, typeof stays>();
  for (const stay of stays) {
    const list = staysByRoom.get(stay.roomId!) ?? [];
    list.push(stay);
    staysByRoom.set(stay.roomId!, list);
  }
  const housekeepingRooms = roomRows.map((room) => {
    const roomStays = staysByRoom.get(room.id) ?? [];
    return {
      ...room,
      closed: closed.has(room.id),
      inHouse: roomStays.some(
        (stay) => stay.status === "checked_in" && stay.checkIn <= today && stay.checkOut > today,
      ),
      departing: roomStays.some((stay) => stay.status === "checked_in" && stay.checkOut === today),
      arriving: roomStays.some((stay) => stay.status === "confirmed" && stay.checkIn === today),
    };
  });
  housekeepingRooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  return c.json({ date: today, rooms: housekeepingRooms });
});

// D1 binds at most 100 parameters per statement.
const ROOM_IDS_PER_STATEMENT = 90;

// Rooms are never deleted and their ids never change, so a room that exists
// here still exists when the batch runs.
async function readMarkedRooms(db: ReturnType<typeof getDb>, roomIds: string[]) {
  const reads = await Promise.all(
    chunks(roomIds, ROOM_IDS_PER_STATEMENT).map((ids) =>
      db
        .select({
          id: rooms.id,
          housekeepingStatus: rooms.housekeepingStatus,
          housekeepingChangedAt: rooms.housekeepingChangedAt,
        })
        .from(rooms)
        .where(inArray(rooms.id, ids)),
    ),
  );
  return reads.flat();
}

housekeepingRoutes.put("/", validate("json", housekeepingMarksSchema), async (c) => {
  const { marks } = c.req.valid("json");
  const db = getDb(c.env.DB);
  const roomIds = marks.map((mark) => mark.roomId);
  if ((await readMarkedRooms(db, roomIds)).length !== roomIds.length)
    throw new HttpError(404, "room not found");
  // Sets, rather than flips, each status so repeated or simultaneous marks agree.
  const changedAt = new Date().toISOString();
  await runBatch(
    db,
    (["dirty", "clean"] as const).flatMap((status) =>
      chunks(
        marks.filter((mark) => mark.status === status).map((mark) => mark.roomId),
        ROOM_IDS_PER_STATEMENT,
      ).map((ids) =>
        db
          .update(rooms)
          .set({ housekeepingStatus: status, housekeepingChangedAt: changedAt })
          .where(inArray(rooms.id, ids)),
      ),
    ),
  );
  return c.json({ rooms: await readMarkedRooms(db, roomIds) });
});
