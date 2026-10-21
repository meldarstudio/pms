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
  stays?: CalendarFixtureStay[];
  closures?: {
    id: string;
    roomId: string;
    starts: string;
    ends: string;
    reason: string | null;
  }[];
};

export type CalendarFixtureUnassigned = CalendarFixtureStay & {
  roomId: null;
  roomTypeId: string;
  roomIndex: number;
  roomCount: number;
};

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
