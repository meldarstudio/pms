import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export function claimRevision(column: AnySQLiteColumn, expected: number) {
  return sql<number>`CASE WHEN ${column} = ${expected} THEN ${column} + 1 ELSE NULL END`;
}

export function isStaleWrite(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /NOT NULL constraint failed: (reservations|guests|coupons)\.revision/.test(error.message) ||
    isStaleWrite(error.cause)
  );
}
