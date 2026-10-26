import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { ReservationDetail, WorkflowAction } from "../src/lib/api.ts";
import {
  validationPreviewActions,
  hasBillingChanges,
  billingPreviewKey,
  changeCheckIn,
  minimumCheckOut,
  roomEdits,
  stayValue,
  type RoomDraft,
  previewFieldErrors,
} from "../src/lib/reservation-editor.ts";
const line = (id: string) =>
  ({
    id,
    roomId: id,
    roomTypeId: "double",
    adults: 2,
    children: 0,
  }) as ReservationDetail["rooms"][number];
const draft = (room: ReservationDetail["rooms"][number]): RoomDraft => ({
  id: room.id,
  room: stayValue(room),
  removed: false,
});
const dates = { checkIn: "2026-10-12", checkOut: "2026-10-15" };

describe("billing changes versus validation", () => {
  it("maps proposed room issues to retained and added form rows after a removal", () => {
    assert.deepEqual(
      previewFieldErrors(
        [
          {
            code: "room is closed for those dates",
            field: "roomId",
            roomIndex: 0,
          },
          { code: "no availability", field: "roomTypeId", roomIndex: 1 },
          {
            code: "too many guests for this room type",
            field: "occupancy",
            roomIndex: 1,
          },
        ],
        [{ removed: true }, { removed: false }, { removed: false }],
      ),
      {
        "rooms[1].room.roomId": "Esta habitación está cerrada para esas fechas.",
        "rooms[2].room.roomTypeId": "No hay disponibilidad para esas fechas.",
        "rooms[2].room": "La habitación no tiene capacidad para todos los huéspedes.",
      },
    );
    assert.equal(previewFieldErrors([], [{ removed: false }]), null);
  });
  const saved = {
    ...dates,
    status: "confirmed",
    savedDiscountCents: 0,
    rooms: [line("101")],
  } as ReservationDetail;

  it("reuses a date quote across room assignments and headcounts but expires it for pricing changes", () => {
    const price: WorkflowAction = {
      type: "dates",
      ...dates,
      checkOut: "2026-10-16",
    };
    const key = billingPreviewKey(saved, [price]);
    for (const patch of [{ roomId: "102" }, { roomId: null }, { adults: 3 }, { children: 1 }]) {
      assert.equal(
        billingPreviewKey(saved, [
          price,
          {
            type: "edit-room",
            lineId: "101",
            room: { ...stayValue(saved.rooms[0]), ...patch },
          },
        ]),
        key,
      );
    }
    for (const financial of [
      { type: "dates", ...dates, checkOut: "2026-10-17" },
      {
        type: "edit-room",
        lineId: "101",
        room: { ...stayValue(saved.rooms[0]), roomTypeId: "single" },
      },
      { type: "add-room", room: stayValue(line("102")) },
      { type: "remove-room", lineId: "101" },
      { type: "set-status", status: "cancelled" },
      { type: "set-discount", amountCents: 1000 },
    ] satisfies WorkflowAction[]) {
      assert.notEqual(billingPreviewKey(saved, [price, financial]), key);
    }
    assert.notEqual(billingPreviewKey({ ...saved, paidCents: 1000 }, [price]), key);
    assert.notEqual(billingPreviewKey({ ...saved, savedDiscountCents: 1000 }, [price]), key);
    assert.notEqual(
      billingPreviewKey(
        {
          ...saved,
          rooms: [
            {
              ...saved.rooms[0],
              nights: [{ date: dates.checkIn, priceCents: 5000 }],
            },
          ],
        },
        [price],
      ),
      key,
    );
    const room = stayValue(line("102"));
    const added = billingPreviewKey(saved, [{ type: "add-room", room }]);
    assert.equal(
      billingPreviewKey(saved, [
        {
          type: "add-room",
          room: { ...room, roomId: null, adults: 1, children: 1 },
        },
      ]),
      added,
    );
    assert.notEqual(
      billingPreviewKey(saved, [{ type: "add-room", room: { ...room, nightlyRateCents: 1000 } }]),
      added,
    );
    const repriced = { ...room, roomTypeId: "single" };
    assert.equal(
      billingPreviewKey(saved, [{ type: "edit-room", lineId: "101", room: repriced }]),
      billingPreviewKey(saved, [
        {
          type: "edit-room",
          lineId: "101",
          room: { ...repriced, roomId: null, adults: 1 },
        },
      ]),
    );
  });

  const editRoom = (patch: Partial<RoomDraft["room"]>): WorkflowAction => ({
    type: "edit-room",
    lineId: "101",
    room: { ...stayValue(saved.rooms[0]), ...patch },
  });
  it.each<[string, ReservationDetail["status"], WorkflowAction, boolean, boolean]>([
    [
      "a later checkout",
      "confirmed",
      { type: "dates", ...dates, checkOut: "2026-10-16" },
      true,
      true,
    ],
    [
      "an earlier arrival",
      "confirmed",
      { type: "dates", ...dates, checkIn: "2026-10-11" },
      true,
      true,
    ],
    [
      "a room type change",
      "confirmed",
      editRoom({ roomTypeId: "single", roomId: null }),
      true,
      true,
    ],
    ["an added room", "confirmed", { type: "add-room", room: stayValue(line("102")) }, true, true],
    ["a removed room", "confirmed", { type: "remove-room", lineId: "101" }, true, true],
    ["a discount", "confirmed", { type: "set-discount", amountCents: 1000 }, true, true],
    ["a cancellation", "confirmed", { type: "set-status", status: "cancelled" }, true, true],
    ["a restoration", "cancelled", { type: "set-status", status: "confirmed" }, true, true],
    [
      "a repeated cancellation",
      "cancelled",
      { type: "set-status", status: "cancelled" },
      false,
      true,
    ],
    ["a checkout", "confirmed", { type: "set-status", status: "checked_out" }, false, true],
    ["an adult count", "confirmed", editRoom({ adults: 3 }), false, true],
    ["a child count", "confirmed", editRoom({ children: 1 }), false, true],
    ["a room assignment", "confirmed", editRoom({ roomId: "102" }), false, true],
    ["a cleared assignment", "confirmed", editRoom({ roomId: null }), false, true],
    ["notes", "confirmed", { type: "notes", notes: "Note" }, false, false],
    [
      "a contact",
      "confirmed",
      {
        type: "contact",
        contact: {
          fullName: "Ana",
          email: null,
          phone: null,
          documentType: null,
          documentNumber: null,
        },
      },
      false,
      false,
    ],
    ["staying guests", "confirmed", { type: "set-guests", guests: [] }, false, false],
  ])(
    "classifies %s on a %s reservation for billing and validation previews",
    (_name, status, action, billing, previewed) => {
      assert.equal(hasBillingChanges({ ...saved, status }, [action]), billing);
      assert.deepEqual(validationPreviewActions([action]), previewed ? [action] : []);
    },
  );

  it("clears the billing badge when the last pricing edit is reverted, even with other unsaved edits", () => {
    const operational: WorkflowAction = {
      type: "edit-room",
      lineId: "101",
      room: { ...stayValue(saved.rooms[0]), roomId: "102", children: 1 },
    };
    const notes: WorkflowAction = { type: "notes", notes: "Late arrival" };
    const price: WorkflowAction = {
      type: "dates",
      ...dates,
      checkOut: "2026-10-16",
    };
    assert.equal(hasBillingChanges(saved, [price, operational, notes]), true);
    assert.deepEqual(validationPreviewActions([price, operational, notes]), [price, operational]);
    assert.equal(hasBillingChanges(saved, [operational, notes]), false);
    assert.deepEqual(validationPreviewActions([operational, notes]), [operational]);
    assert.equal(hasBillingChanges(saved, [{ type: "dates", ...dates }]), false);
    assert.equal(hasBillingChanges(saved, [{ type: "set-discount", amountCents: 0 }]), false);
    assert.equal(hasBillingChanges(saved, []), false);
  });

  it("compares against the saved room type after a save or discard", () => {
    const drafts = [draft(saved.rooms[0])];
    drafts[0].room.roomTypeId = "single";
    const changes = roomEdits(saved, drafts);
    assert.equal(hasBillingChanges(saved, changes), true);
    const updated = {
      ...saved,
      rooms: [{ ...saved.rooms[0], roomTypeId: "single" }],
    };
    assert.equal(hasBillingChanges(updated, roomEdits(updated, drafts)), false);
    assert.equal(hasBillingChanges(saved, roomEdits(saved, [draft(saved.rooms[0])])), false);
  });
});
describe("reservation edit drafts", () => {
  it("emits removals, additions and edits but ignores equal drafts and unsaved removals", () => {
    const saved = line("101");
    const added = draft(line("102"));
    assert.deepEqual(
      roomEdits({ rooms: [saved] } as ReservationDetail, [
        { ...draft(saved), removed: true },
        added,
      ]),
      [
        { type: "remove-room", lineId: "101" },
        { type: "add-room", room: added.room },
      ],
    );
    const changed = { ...stayValue(saved), adults: 3 };
    assert.deepEqual(
      roomEdits({ rooms: [saved] } as ReservationDetail, [
        { id: saved.id, room: changed, removed: false },
        { id: "new", room: stayValue(line("102")), removed: true },
      ]),
      [{ type: "edit-room", lineId: "101", room: changed }],
    );
    assert.deepEqual(roomEdits({ rooms: [saved] } as ReservationDetail, [draft(saved)]), []);
  });
});
describe("shared stay dates", () => {
  it("advances checkout when an arrival would leave less than a night", () => {
    assert.deepEqual(changeCheckIn(dates, "2026-10-15"), {
      checkIn: "2026-10-15",
      checkOut: "2026-10-16",
    });
    assert.deepEqual(changeCheckIn(dates, "2026-10-10"), {
      checkIn: "2026-10-10",
      checkOut: dates.checkOut,
    });
    assert.equal(minimumCheckOut("2026-12-31"), "2027-01-01");
    assert.equal(minimumCheckOut("2028-02-28"), "2028-02-29");
  });
});
