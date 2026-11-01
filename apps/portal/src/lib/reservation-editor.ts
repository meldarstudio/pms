import type {
  BookingContact,
  ReservationDetail,
  Reservation,
  Room,
  RoomClosure,
  StayingGuest,
  WorkflowAction,
  WorkflowRoom,
  WorkflowIssue,
} from "./api.ts";
import { translateError } from "./errors.ts";

export type RoomDraft = {
  id: string;
  room: WorkflowRoom;
  removed: boolean;
};

export function previewFieldErrors(
  issues: WorkflowIssue[],
  drafts: { removed: boolean }[],
): Record<string, string> | null {
  const indices = drafts.flatMap((draft, index) => (draft.removed ? [] : [index]));
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const index = indices[issue.roomIndex];
    if (index === undefined) continue;
    const path = `rooms[${index}].room${issue.field === "occupancy" ? "" : `.${issue.field}`}`;
    const message = translateError(issue.code);
    fields[path] = fields[path] ? `${fields[path]} ${message}` : message;
  }
  return Object.keys(fields).length ? fields : null;
}
export function minimumCheckOut(checkIn: string) {
  const date = new Date(`${checkIn}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function changeCheckIn(
  room: { checkIn: string; checkOut: string },
  checkIn: string,
): { checkIn: string; checkOut: string } {
  return {
    ...room,
    checkIn,
    checkOut: room.checkOut > checkIn ? room.checkOut : minimumCheckOut(checkIn),
  };
}

export const stayValue = (line: ReservationDetail["rooms"][number]): WorkflowRoom => ({
  roomTypeId: line.roomTypeId,
  roomId: line.roomId,
  adults: line.adults,
  children: line.children,
});
export const contactValue = (contact: BookingContact): BookingContact => ({
  fullName: contact.fullName.trim(),
  email: contact.email?.trim() || null,
  phone: contact.phone?.trim() || null,
  documentType: contact.documentType?.trim() || null,
  documentNumber: contact.documentNumber?.trim() || null,
});
export const guestValues = (guests: StayingGuest[]) =>
  guests.map((g) => ({
    ...contactValue(g),
    id: g.id,
    reservationRoomId: g.reservationRoomId,
  }));
export function roomEdits(detail: ReservationDetail, drafts: RoomDraft[]): WorkflowAction[] {
  const actions: WorkflowAction[] = [];
  for (const draft of drafts) {
    const saved = detail.rooms.find((l) => l.id === draft.id);
    if (draft.removed) {
      if (saved)
        actions.push({
          type: "remove-room",
          lineId: saved.id,
        });
    } else if (!saved) actions.push({ type: "add-room", room: draft.room });
    else {
      const previous = stayValue(saved);
      const room = {
        roomTypeId: draft.room.roomTypeId,
        roomId: draft.room.roomId,
        adults: draft.room.adults,
        children: draft.room.children,
      };
      if (JSON.stringify(room) !== JSON.stringify(previous))
        actions.push({ type: "edit-room", lineId: saved.id, room });
    }
  }
  return actions;
}
export function overlappingRoomIds(others: WorkflowRoom[]): Set<string> {
  return new Set(others.flatMap((room) => (room.roomId ? [room.roomId] : [])));
}

export function availableRoomTypeIds(
  stay: { checkIn: string; checkOut: string },
  rooms: Room[],
  reservations: Reservation[],
  closures: RoomClosure[],
  drafts: RoomDraft[],
  reservationId: string,
): Set<string> {
  const nights =
    (Date.parse(`${stay.checkOut}T00:00:00Z`) - Date.parse(`${stay.checkIn}T00:00:00Z`)) / 86400000;
  if (!(nights >= 1 && nights <= 60)) return new Set();
  const dates = Array.from({ length: nights }, (_, index) =>
    new Date(Date.parse(`${stay.checkIn}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10),
  );
  const others = reservations.filter(
    (reservation) => reservation.id !== reservationId && reservation.status !== "cancelled",
  );
  return new Set(
    [...new Set(rooms.map((room) => room.roomTypeId))].filter((typeId) => {
      const physicalRooms = rooms.filter((room) => room.roomTypeId === typeId);
      const used = drafts.filter(
        (draft) => !draft.removed && draft.room.roomTypeId === typeId,
      ).length;
      return dates.every((date) => {
        const booked = others
          .filter((reservation) => reservation.checkIn <= date && date < reservation.checkOut)
          .reduce(
            (count, reservation) =>
              count + reservation.rooms.filter((room) => room.roomTypeId === typeId).length,
            0,
          );
        const closed = new Set(
          closures
            .filter(
              (closure) =>
                closure.starts <= date &&
                date < closure.ends &&
                physicalRooms.some((room) => room.id === closure.roomId),
            )
            .map((closure) => closure.roomId),
        ).size;
        return physicalRooms.length > booked + closed + used;
      });
    }),
  );
}

export function validationPreviewActions(actions: WorkflowAction[]) {
  return actions.filter((action) => !["notes", "contact", "set-guests"].includes(action.type));
}

export function hasBillingChanges(detail: ReservationDetail, actions: WorkflowAction[]) {
  return actions.some((action) => {
    switch (action.type) {
      case "dates":
        return action.checkIn !== detail.checkIn || action.checkOut !== detail.checkOut;
      case "add-room":
      case "remove-room":
        return true;
      case "edit-room":
        return (
          action.room.roomTypeId !==
          detail.rooms.find((room) => room.id === action.lineId)?.roomTypeId
        );
      case "set-status":
        return (action.status === "cancelled") !== (detail.status === "cancelled");
      case "set-discount":
        return action.amountCents !== detail.savedDiscountCents;
      default:
        return false;
    }
  });
}

export function billingPreviewKey(detail: ReservationDetail, actions: WorkflowAction[]) {
  const pricingActions = actions
    .filter((action) => hasBillingChanges(detail, [action]))
    .map((action) => {
      switch (action.type) {
        case "add-room":
          return {
            type: action.type,
            roomTypeId: action.room.roomTypeId,
            nightlyRateCents: action.room.nightlyRateCents,
          };
        case "edit-room":
          return {
            type: action.type,
            lineId: action.lineId,
            roomTypeId: action.room.roomTypeId,
          };
        case "set-status":
          return { type: action.type, cancelled: action.status === "cancelled" };
        default:
          return action;
      }
    });
  return JSON.stringify([
    {
      id: detail.id,
      checkIn: detail.checkIn,
      checkOut: detail.checkOut,
      cancelled: detail.status === "cancelled",
      savedDiscountCents: detail.savedDiscountCents,
      paidCents: detail.paidCents,
      rooms: detail.rooms.map(({ id, roomTypeId, nights }) => ({
        id,
        roomTypeId,
        nights,
      })),
    },
    pricingActions,
  ]);
}
