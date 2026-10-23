import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { ApiError } from "../src/lib/api-error.ts";
import { roomFieldErrors } from "../src/lib/room-form.ts";

describe("room edit form", () => {
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
