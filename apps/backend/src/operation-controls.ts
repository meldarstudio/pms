import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { operationControls } from "./db/schema";
import { HttpError } from "./http";

const CONTROLS_ID = 1;

export const PUBLIC_PAYMENTS_PAUSED = "online payments are paused";

export async function readPublicPaymentAdmission(db: Db) {
  const [controls] = await db
    .select()
    .from(operationControls)
    .where(eq(operationControls.id, CONTROLS_ID));
  return {
    admitted: controls?.publicPaymentsAdmitted ?? false,
    updatedAt: controls?.updatedAt ?? null,
  };
}

export async function setPublicPaymentAdmission(
  db: Db,
  admitted: boolean,
  change: { accountId: string; now: Date },
) {
  const values = {
    publicPaymentsAdmitted: admitted,
    updatedAt: change.now.toISOString(),
    updatedBy: change.accountId,
  };
  await db
    .insert(operationControls)
    .values({ id: CONTROLS_ID, ...values })
    .onConflictDoUpdate({ target: operationControls.id, set: values });
  return readPublicPaymentAdmission(db);
}

export async function requirePublicPaymentAdmission(db: Db) {
  if (!(await readPublicPaymentAdmission(db)).admitted)
    throw new HttpError(503, PUBLIC_PAYMENTS_PAUSED);
}
