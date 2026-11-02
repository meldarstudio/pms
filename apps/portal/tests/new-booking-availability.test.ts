import assert from "node:assert/strict";
import { it } from "vite-plus/test";
import { newBookingAvailability } from "../src/lib/new-booking-availability.ts";
import type { Availability } from "../src/lib/api.ts";
import type { NewBookingValues } from "../src/lib/reservation-form-schemas.ts";

const types: Availability["roomTypes"] = [
  {
    id: "double",
    name: "Doble",
    free: 2,
    freeRoomIds: ["101", "102", "103"],
    maxAdults: 2,
    maxChildren: 2,
    totalCents: 10000,
    nights: [],
  },
  {
    id: "suite",
    name: "Suite",
    free: 0,
    freeRoomIds: [],
    maxAdults: 4,
    maxChildren: 2,
    totalCents: 20000,
    nights: [],
  },
];
const physical = [
  { id: "101", number: "101", roomTypeId: "double" },
  { id: "102", number: "102", roomTypeId: "double" },
  { id: "103", number: "103", roomTypeId: "double" },
  { id: "201", number: "201", roomTypeId: "suite" },
];
const draft = (
  id: string,
  roomTypeId = "double",
  roomId: string | null = null,
): NewBookingValues["rooms"][number] => ({
  id,
  removed: false,
  room: { roomTypeId, roomId, adults: "1", children: "0" },
});

it("keeps earlier room selections when inventory shrinks and releases duplicate assignments", () => {
  const drafts = [draft("a", "double", "101"), draft("b", "double", "101"), draft("c")];
  const result = newBookingAvailability(drafts, types, physical);
  assert.equal(result.rooms[0].room.roomId, "101");
  assert.equal(result.rooms[1].room.roomId, null);
  assert.equal(result.rooms[2].room.roomTypeId, "");
  assert.equal(result.canAdd, false);
});

it("clears an occupied assignment while retaining its available type and guest counts", () => {
  const drafts = [draft("a", "double", "101")];
  const occupied = types.map((type) => ({
    ...type,
    freeRoomIds: type.freeRoomIds.filter((id) => id !== "101"),
  }));
  const result = newBookingAvailability(drafts, occupied, physical);
  assert.equal(result.rooms[0].room.roomId, null);
  assert.equal(result.rooms[0].room.roomTypeId, "double");
  assert.equal(result.rooms[0].room.adults, "1");
  assert.equal(drafts[0].room.roomId, "101");
});
