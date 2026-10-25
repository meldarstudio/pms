import assert from "node:assert/strict";
import { it } from "vite-plus/test";
import { ApiError, NetworkError } from "../src/lib/api-error.ts";
import { retryRead } from "../src/lib/query-client.ts";

it.each([
  ["a missing record", new ApiError(404, "reservation not found"), 0, false],
  ["a rejected request", new ApiError(400, "invalid email"), 0, false],
  ["an expired session", new ApiError(401, "unauthorized"), 0, false],
  ["a server failure", new ApiError(503, "temporary failure"), 0, true],
  ["a dropped connection", new NetworkError(), 1, true],
  ["a third connection failure", new NetworkError(), 2, false],
] as const)("retries a read after %s: %s", (_, error, failures, expected) => {
  assert.equal(retryRead(failures, error), expected);
});
