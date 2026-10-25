export type CalendarFixtureStay = {
  id: string;
  reservationId: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
};

export type CalendarFixtureRoom = {
  id: string;
  number: string;
  roomTypeId: string;
  roomTypeName: string;
  housekeepingStatus?: "dirty" | "clean";
  stays?: CalendarFixtureStay[];
  closures?: CalendarFixtureClosure[];
};

export type CalendarFixtureClosure = {
  id: string;
  roomId: string;
  starts: string;
  ends: string;
  reason: string | null;
};

export type CalendarFixtureUnassigned = CalendarFixtureStay & {
  roomId: null;
  roomTypeId: string;
  roomIndex: number;
  roomCount: number;
};

type SampleRoom = Required<Omit<CalendarFixtureRoom, "housekeepingStatus">> & CalendarFixtureRoom;

export type CalendarFixture = {
  rooms: SampleRoom[];
  unassigned: CalendarFixtureUnassigned[];
};

/**
 * Rooms 2 and 101 (Doble) and 10 (Suite) around 20 Oct 2026: room 10 closes 18–20 Oct,
 * room 101 has a stay checking out on 20 Oct and one running past the week, and one
 * double for 22–24 Oct has no room yet.
 */
export const sampleWeek: CalendarFixture = {
  rooms: [
    {
      id: "room-2",
      number: "2",
      roomTypeId: "double",
      roomTypeName: "Doble",
      stays: [],
      closures: [],
    },
    {
      id: "room-10",
      number: "10",
      roomTypeId: "suite",
      roomTypeName: "Suite",
      stays: [],
      closures: [
        {
          id: "closure-1",
          roomId: "room-10",
          starts: "2026-10-18",
          ends: "2026-10-20",
          reason: "Mantenimiento",
        },
      ],
    },
    {
      id: "room-101",
      number: "101",
      roomTypeId: "double",
      roomTypeName: "Doble",
      stays: [
        {
          id: "line-ada",
          reservationId: "res-ada",
          guestName: "Ada Lovelace",
          status: "confirmed",
          checkIn: "2026-10-18",
          checkOut: "2026-10-20",
        },
        {
          id: "line-long",
          reservationId: "res-long",
          guestName: "Grace Hopper",
          status: "checked_out",
          checkIn: "2026-10-21",
          checkOut: "2026-11-04",
        },
      ],
      closures: [],
    },
  ],
  unassigned: [
    {
      id: "line-open",
      reservationId: "res-open",
      guestName: "Mary Jackson",
      status: "confirmed",
      checkIn: "2026-10-22",
      checkOut: "2026-10-24",
      roomId: null,
      roomTypeId: "double",
      roomIndex: 1,
      roomCount: 1,
    },
  ],
};

/** The sample week with one room replaced by `change(room)`. */
export function sampleWeekWith(
  roomId: string,
  change: (room: SampleRoom) => SampleRoom,
): CalendarFixture {
  return {
    ...sampleWeek,
    rooms: sampleWeek.rooms.map((room) => (room.id === roomId ? change(room) : room)),
  };
}

export function calendarWindow(
  url: URL,
  body: {
    missingSetup?: "types" | "rooms" | null;
    rooms?: CalendarFixtureRoom[];
    unassigned?: CalendarFixtureUnassigned[];
  } = {},
) {
  return {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    missingSetup: body.missingSetup ?? null,
    rooms: (body.rooms ?? []).map((room) => ({
      housekeepingStatus: "clean",
      stays: [],
      closures: [],
      ...room,
    })),
    unassigned: body.unassigned ?? [],
  };
}

export function calendarResponse(url: URL, body: Parameters<typeof calendarWindow>[1] = {}) {
  return Response.json(calendarWindow(url, body));
}

export function catalogCalendarRooms(
  rooms: { id: string; number: string; roomTypeId: string }[],
  typeNames: Map<string, string>,
  fallbackName = "Room",
): CalendarFixtureRoom[] {
  return rooms.map((room) => ({
    id: room.id,
    number: room.number,
    roomTypeId: room.roomTypeId,
    roomTypeName: typeNames.get(room.roomTypeId) ?? fallbackName,
  }));
}
