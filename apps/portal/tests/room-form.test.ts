import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { ApiError } from "../src/lib/api-error.ts";
import { roomEditSchema, roomFieldErrors, roomPatch } from "../src/lib/room-form.ts";

const saved = { number: "101", roomTypeId: "double" };

describe("room edit form", () => {
  it("requires a trimmed number of at most 20 characters", () => {
    assert.equal(roomEditSchema.safeParse({ number: "  ", roomTypeId: "double" }).success, false);
    assert.equal(
      roomEditSchema.safeParse({ number: "x".repeat(21), roomTypeId: "double" }).success,
      false,
    );
    assert.equal(roomEditSchema.safeParse({ number: " 101 ", roomTypeId: "double" }).success, true);
  });

  it("sends only the fields that changed", () => {
    assert.equal(roomPatch(saved, { number: "101", roomTypeId: "double" }), null);
    assert.equal(roomPatch(saved, { number: " 101 ", roomTypeId: "double" }), null);
    assert.deepEqual(roomPatch(saved, { number: "102", roomTypeId: "double" }), {
      number: "102",
    });
    assert.deepEqual(roomPatch(saved, { number: "101", roomTypeId: "suite" }), {
      roomTypeId: "suite",
    });
  });

  it("maps known room conflicts onto the field that caused them", () => {
    assert.deepEqual(roomFieldErrors(new ApiError(409, "room number already exists")), {
      number: "Este número de habitación ya está en uso.",
    });
    assert.equal(
      roomFieldErrors(new ApiError(409, "room has an assigned stay"))?.roomTypeId,
      "Desasigna la estancia o muévela a otra habitación antes de cambiar el tipo.",
    );
    assert.equal(
      roomFieldErrors(new ApiError(409, "no availability"))?.roomTypeId,
      "Este tipo no tendría suficientes habitaciones para las reservas existentes.",
    );
    assert.equal(roomFieldErrors(new ApiError(404, "room not found")), null);
    assert.equal(roomFieldErrors(new Error("offline")), null);
  });
});
