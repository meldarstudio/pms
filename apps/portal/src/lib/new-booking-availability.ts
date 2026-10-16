import type { Availability, Room } from "./api.ts";
import type { NewBookingValues } from "./reservation-form-schemas.ts";

// Reserve draft inventory in row order, including rooms without an assignment.
export function newBookingAvailability(
  drafts: NewBookingValues["rooms"],
  types: Availability["roomTypes"],
  physicalRooms: Room[],
  unavailable: Set<string>,
) {
  const remaining = new Map(types.map((type) => [type.id, type.free]));
  const assigned = new Set(unavailable);
  let changed = false;
  const normalized = drafts.map((draft) => {
    let { roomTypeId, roomId } = draft.room;
    const free = remaining.get(roomTypeId) ?? 0;
    if (free <= 0) {
      roomTypeId = "";
      roomId = null;
    } else {
      remaining.set(roomTypeId, free - 1);
      if (roomId) {
        const room = physicalRooms.find((room) => room.id === roomId);
        if (!room || room.roomTypeId !== roomTypeId || assigned.has(roomId)) roomId = null;
        else assigned.add(roomId);
      }
    }
    if (roomTypeId === draft.room.roomTypeId && roomId === draft.room.roomId) return draft;
    changed = true;
    return { ...draft, room: { ...draft.room, roomTypeId, roomId } };
  });
  return {
    rooms: changed ? normalized : drafts,
    options: normalized.map((draft, index) => {
      const others = normalized.filter((_, otherIndex) => otherIndex !== index);
      const usedRoomIds = new Set(others.map((other) => other.room.roomId));
      return {
        types: types
          .filter(
            (type) =>
              type.free > others.filter((other) => other.room.roomTypeId === type.id).length,
          )
          .map((type) => ({ value: type.id, label: type.name })),
        numbers: physicalRooms
          .filter(
            (room) =>
              room.roomTypeId === draft.room.roomTypeId &&
              !unavailable.has(room.id) &&
              !usedRoomIds.has(room.id),
          )
          .map((room) => ({ value: room.id, label: room.number })),
      };
    }),
    canAdd: drafts.length < 60 && types.reduce((sum, type) => sum + type.free, 0) > drafts.length,
  };
}
