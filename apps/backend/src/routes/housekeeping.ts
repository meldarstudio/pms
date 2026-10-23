import { housekeepingWriteSchema } from "@pms/shared";
import { and, eq, gt, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { reservationRooms, reservations, roomClosures, roomTypes, rooms } from "../db/schema";
import type { Env } from "../env";
import { HttpError, validate } from "../http";

const stayStatuses = ["confirmed", "checked_in", "checked_out"];

export const housekeepingRoutes = new Hono<Env>();

// One read of every room for the property date. Occupancy comes from
// reservations; the housekeeping status is only what staff last marked.
housekeepingRoutes.get("/", async (c) => {
  const today = c.get("propertyCalendar").today;
  const db = getDb(c.env.DB);
  const [listedRooms, stays, closures] = await Promise.all([
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
          inArray(reservations.status, stayStatuses),
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
  const listed = listedRooms.map((room) => {
    const own = staysByRoom.get(room.id) ?? [];
    const leaving = own.find((stay) => stay.checkOut === today);
    return {
      ...room,
      closed: closed.has(room.id),
      inHouse: own.some(
        (stay) => stay.status === "checked_in" && stay.checkIn <= today && stay.checkOut > today,
      ),
      departure: leaving ? (leaving.status === "checked_out" ? "checked_out" : "expected") : null,
      arriving: own.some((stay) => stay.status === "confirmed" && stay.checkIn === today),
    };
  });
  const urgency = (room: (typeof listed)[number]) =>
    room.housekeepingStatus !== "dirty" ? 2 : room.arriving ? 0 : 1;
  listed.sort(
    (a, b) =>
      urgency(a) - urgency(b) || a.number.localeCompare(b.number, undefined, { numeric: true }),
  );
  return c.json({ date: today, rooms: listed });
});

housekeepingRoutes.put("/:roomId", validate("json", housekeepingWriteSchema), async (c) => {
  const { status } = c.req.valid("json");
  const db = getDb(c.env.DB);
  const id = c.req.param("roomId");
  const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, id));
  if (!room) throw new HttpError(404, "room not found");
  // Sets, rather than flips, the status so repeated or simultaneous taps agree.
  await db
    .update(rooms)
    .set({ housekeepingStatus: status, housekeepingChangedAt: new Date().toISOString() })
    .where(eq(rooms.id, id));
  const [updated] = await db.select().from(rooms).where(eq(rooms.id, id));
  return c.json(updated);
});
