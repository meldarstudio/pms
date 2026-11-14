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
    calendar: z
      .object({
        source: content,
        from: z.iso.date(),
        through: z.iso.date(),
        nonWorkingDates: z.array(z.iso.date()).max(1000),
        countingConvention: z.literal("exclude-filing-date"),
      })
      .strict(),
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

export function complaintDeadline(filedAt: string, timeZone: string, config: ComplaintBookConfig) {
  const filedDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(filedAt));
  const calendar = config.calendar;
  if (filedDate < calendar.from || filedDate > calendar.through)
    throw new HttpError(503, "complaint calendar unavailable");
  const day = new Date(`${filedDate}T00:00:00Z`);
  let remaining = 15;
  while (remaining > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    const label = day.toISOString().slice(0, 10);
    if (label > calendar.through) throw new HttpError(503, "complaint calendar unavailable");
    if (![0, 6].includes(day.getUTCDay()) && !calendar.nonWorkingDates.includes(label)) remaining--;
  }
  return day.toISOString().slice(0, 10);
}
