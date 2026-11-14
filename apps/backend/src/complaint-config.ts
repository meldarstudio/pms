import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "./http";
import { loopbackUrl } from "./loopback";

const content = z.string().trim().min(1).max(20000);
const translated = z.object({ es: content, en: content }).strict();
export const complaintBookConfigSchema = z
  .object({
    mode: z.literal("development"),
    bookId: z.string().regex(/^[A-Za-z0-9-]{1,40}$/),
    establishmentId: content,
    firstNumber: z.number().int().positive().max(1000000000),
    provider: z
      .object({ legalName: content, ruc: z.string().regex(/^\d{11}$/), address: content })
      .strict(),
    collectionNotice: translated,
    privacyInformation: translated,
    policyVersion: content,
    retentionAndDisposal: content,
    monitoredBy: content,
    backupProcedure: content,
    emailFrom: z.string().email(),
  })
  .strict();
export type ComplaintBookConfig = z.infer<typeof complaintBookConfigSchema>;

export function developmentComplaintConfig(raw: string | undefined, requestUrl: string) {
  if (!loopbackUrl(requestUrl)) throw new HttpError(503, "complaint book unavailable");
  try {
    return complaintBookConfigSchema.parse(JSON.parse(raw ?? ""));
  } catch {
    throw new HttpError(503, "complaint book unavailable");
  }
}

export const complaintCalendarSource =
  "Lunes a viernes; los feriados y días no laborables cuentan como hábiles, por lo que el plazo nunca es posterior al legal.";

function propertyDate(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

export function complaintSheetReference(number: SQL<number>, filedAt: string, timeZone: string) {
  return sql<string>`printf('%09d', ${number}) || '-' || ${propertyDate(filedAt, timeZone).slice(0, 4)}`;
}

export function complaintResponseDueDate(filedAt: string, timeZone: string) {
  const day = new Date(`${propertyDate(filedAt, timeZone)}T00:00:00Z`);
  let remaining = 15;
  while (remaining > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (![0, 6].includes(day.getUTCDay())) remaining--;
  }
  return day.toISOString().slice(0, 10);
}
