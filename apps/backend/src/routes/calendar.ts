import { calendarQuerySchema } from "@pms/shared";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import {
  guests,
  reservationRooms,
  reservations,
  roomClosures,
  roomTypes,
  rooms,
} from "../db/schema";
import type { Env } from "../env";
import { HttpError, validate } from "../http";
import { inclusiveDates } from "../lib/dates";

const maxCalendarDays = 14 + 7 + 7;
const barStatuses = ["confirmed", "checked_in", "checked_out"];
const openStatuses = new Set(["confirmed", "checked_in"]);

export const calendarRoutes = new Hono<Env>();

calendarRoutes.get("/", validate("query", calendarQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  const mornings = inclusiveDates(from, to);
  if (mornings.length < 1) throw new HttpError(400, "calendar window is incomplete");
  if (mornings.length > maxCalendarDays) throw new HttpError(400, "calendar range is too wide");
  const db = getDb(c.env.DB);
  const [typeRows, rows, lines, closures] = await Promise.all([
    db.select({ id: roomTypes.id }).from(roomTypes),
    db
      .select({
        id: rooms.id,
        number: rooms.number,
        roomTypeId: rooms.roomTypeId,
        roomTypeName: roomTypes.name,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId)),
    db
      .select({
        id: sql<string>`${reservationRooms.id}`.as("stay_id"),
        reservationId: sql<string>`${reservations.id}`.as("stay_reservation_id"),
        guestName: guests.fullName,
        status: reservations.status,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        roomId: reservationRooms.roomId,
        roomTypeId: reservationRooms.roomTypeId,
        rowOrder: sql<number>`reservation_rooms.rowid`.as("stay_rowid"),
      })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .where(
        and(
          inArray(reservations.status, barStatuses),
          lte(reservations.checkIn, to),
          gte(reservations.checkOut, from),
        ),
      ),
    db
      .select({
        id: roomClosures.id,
        roomId: roomClosures.roomId,
        starts: roomClosures.starts,
        ends: roomClosures.ends,
        reason: roomClosures.reason,
      })
      .from(roomClosures)
      .where(and(lte(roomClosures.starts, to), gte(roomClosures.ends, from))),
  ]);
  rows.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const byReservation = new Map<string, typeof lines>();
  for (const line of lines) {
    const group = byReservation.get(line.reservationId) ?? [];
    group.push(line);
    byReservation.set(line.reservationId, group);
  }
  const staysByRoom = new Map<string, typeof lines>();
  const unassigned: {
    id: string;
    reservationId: string;
    guestName: string;
    status: string;
    checkIn: string;
    checkOut: string;
    roomTypeId: string;
    roomIndex: number;
    roomCount: number;
  }[] = [];
  for (const group of byReservation.values()) {
    group.sort((a, b) => a.rowOrder - b.rowOrder);
    group.forEach((line, index) => {
      const stay = {
        id: line.id,
        reservationId: line.reservationId,
        guestName: line.guestName,
        status: line.status,
        checkIn: line.checkIn,
        checkOut: line.checkOut,
        roomTypeId: line.roomTypeId,
        roomIndex: index + 1,
        roomCount: group.length,
      };
      if (line.roomId) {
        const stays = staysByRoom.get(line.roomId) ?? [];
        stays.push(line);
        staysByRoom.set(line.roomId, stays);
        return;
      }
      if (openStatuses.has(line.status) && line.checkOut > from) unassigned.push(stay);
    });
  }
  unassigned.sort(
    (a, b) =>
      a.checkIn.localeCompare(b.checkIn) ||
      a.guestName.localeCompare(b.guestName) ||
      a.roomIndex - b.roomIndex,
  );
  const closuresByRoom = new Map<string, typeof closures>();
  for (const closure of closures) {
    const list = closuresByRoom.get(closure.roomId) ?? [];
    list.push(closure);
    closuresByRoom.set(closure.roomId, list);
  }
  const missingSetup = typeRows.length === 0 ? "types" : rows.length === 0 ? "rooms" : null;
  return c.json({
    from,
    to,
    missingSetup,
    rooms: rows.map((room) => ({
      ...room,
      stays: (staysByRoom.get(room.id) ?? []).map((stay) => ({
        id: stay.id,
        reservationId: stay.reservationId,
        guestName: stay.guestName,
        status: stay.status,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
      })),
      closures: closuresByRoom.get(room.id) ?? [],
    })),
    unassigned: unassigned.map((stay) => ({ ...stay, roomId: null })),
  });
});
