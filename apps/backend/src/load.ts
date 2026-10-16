import { eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import {
  reservationGuests,
  payments,
  guests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomTypes,
  rooms,
} from "./db/schema";
import { HttpError } from "./http";
import { presentReservation } from "./present";

export async function reservationDetail(db: Db, id: string, currency: string) {
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id));
  if (!reservation) throw new HttpError(404, "reservation not found");
  const [guest] = await db.select().from(guests).where(eq(guests.id, reservation.guestId));
  if (!guest) throw new HttpError(404, "guest not found");
  const lines = await db
    .select()
    .from(reservationRooms)
    .where(eq(reservationRooms.reservationId, id));
  const lineIds = lines.map((line) => line.id);
  const nights =
    lineIds.length === 0
      ? []
      : await db
          .select()
          .from(reservationRoomNights)
          .where(inArray(reservationRoomNights.reservationRoomId, lineIds));
  const typeIds = [...new Set(lines.map((line) => line.roomTypeId))];
  const types =
    typeIds.length === 0
      ? []
      : await db.select().from(roomTypes).where(inArray(roomTypes.id, typeIds));
  const roomIds = lines.flatMap((line) => (line.roomId ? [line.roomId] : []));
  const roomRows =
    roomIds.length === 0 ? [] : await db.select().from(rooms).where(inArray(rooms.id, roomIds));
  return presentReservation({
    stayingGuests: await db
      .select()
      .from(reservationGuests)
      .where(eq(reservationGuests.reservationId, id)),
    payments: await db.select().from(payments).where(eq(payments.reservationId, id)),
    reservation,
    guest,
    lines,
    nights,
    types,
    roomRows,
    currency,
  });
}
