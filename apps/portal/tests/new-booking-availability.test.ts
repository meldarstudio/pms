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
    maxOccupancy: 2,
    totalCents: 10000,
    nights: [],
  },
  {
    id: "suite",
    name: "Suite",
    free: 0,
    maxOccupancy: 4,
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

it("offers only types with capacity and physical rooms free for the whole stay", () => {
  const drafts = [draft("a")];
  const result = newBookingAvailability(drafts, types, physical, new Set(["101", "102"]));
  assert.deepEqual(result.options[0].types, [{ value: "double", label: "Doble" }]);
  assert.deepEqual(result.options[0].numbers, [{ value: "103", label: "103" }]);
  assert.equal(result.rooms, drafts);
});

it("counts unassigned draft rooms against type capacity and excludes assigned draft room numbers", () => {
  const result = newBookingAvailability(
    [draft("a", "double", "101"), draft("b"), draft("c", "")],
    types,
    physical,
    new Set(),
  );
  assert.deepEqual(result.options[2].types, []);
  assert.deepEqual(
    result.options[1].numbers.map((room) => room.value),
    ["102", "103"],
  );
  assert.deepEqual(result.options[0].types, [{ value: "double", label: "Doble" }]);
  assert.equal(result.canAdd, false);
});

it("clears unavailable types and assignments after an availability change without removing guest counts", () => {
  const drafts = [draft("a", "double", "101"), draft("b", "suite", "201")];
  const result = newBookingAvailability(drafts, types, physical, new Set(["101"]));
  assert.equal(result.rooms[0].room.roomId, null);
  assert.equal(result.rooms[0].room.roomTypeId, "double");
  assert.equal(result.rooms[1].room.roomTypeId, "");
  assert.equal(result.rooms[1].room.roomId, null);
  assert.equal(result.rooms[1].room.adults, "1");
  assert.equal(drafts[0].room.roomId, "101");
});

it("keeps earlier room selections when inventory shrinks and releases duplicate assignments", () => {
  const drafts = [draft("a", "double", "101"), draft("b", "double", "101"), draft("c")];
  const result = newBookingAvailability(drafts, types, physical, new Set());
  assert.equal(result.rooms[0].room.roomId, "101");
  assert.equal(result.rooms[1].room.roomId, null);
  assert.equal(result.rooms[2].room.roomTypeId, "");
  assert.equal(result.canAdd, false);
});
