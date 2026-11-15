import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { ReservationDetail, WorkflowAction } from "../src/lib/api.ts";
import {
  billingPreviewKey,
  roomEdits,
  stayValue,
  type RoomDraft,
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
