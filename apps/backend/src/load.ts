import { inArray } from "drizzle-orm";
import type { Db } from "./db";
import { roomTypes, rooms } from "./db/schema";
import { presentReservation } from "./present";
import { loadState } from "./workflow";

export async function reservationDetail(db: Db, id: string, currency: string) {
  const {
    reservation,
    contact: guest,
    lines,
    stayingGuests,
    payments,
    cancellations,
    refunds,
  } = await loadState(db, id);
  const nights = lines.flatMap((line) =>
    line.nights.map((night) => ({ ...night, reservationRoomId: line.id })),
  );
  const typeIds = [...new Set(lines.map((line) => line.roomTypeId))];
  const types =
    typeIds.length === 0
      ? []
      : await db.select().from(roomTypes).where(inArray(roomTypes.id, typeIds));
  const roomIds = lines.flatMap((line) => (line.roomId ? [line.roomId] : []));
  const roomRows =
    roomIds.length === 0 ? [] : await db.select().from(rooms).where(inArray(rooms.id, roomIds));
  return presentReservation({
    stayingGuests,
    payments,
    cancellations,
    refunds,
    reservation,
    guest,
    lines,
    nights,
    types,
    roomRows,
    currency,
  });
}
