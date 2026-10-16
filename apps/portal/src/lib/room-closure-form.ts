import { differenceInCalendarDays, parseISO } from "date-fns";
import { z } from "zod";
import { ApiError } from "./api-error.ts";

export const roomClosureFormSchema = z
  .object({
    starts: z.iso.date("Selecciona el inicio del cierre."),
    ends: z.iso.date("Selecciona la fecha de reapertura."),
    reason: z.string().trim().max(80, "Máximo 80 caracteres."),
  })
  .superRefine((value, ctx) => {
    const nights = closureNights(value.starts, value.ends);
    if (nights < 1)
      ctx.addIssue({
        code: "custom",
        path: ["ends"],
        message: "La reapertura debe ser posterior al inicio del cierre.",
      });
    if (nights > 60)
      ctx.addIssue({
        code: "custom",
        path: ["ends"],
        message: "El cierre no puede superar las 60 noches.",
      });
  });

export type RoomClosureValues = z.input<typeof roomClosureFormSchema>;

export function closureNights(starts: string, ends: string) {
  return starts && ends ? differenceInCalendarDays(parseISO(ends), parseISO(starts)) : 0;
}

export function closureUnchanged(
  saved: { starts: string; ends: string; reason: string | null },
  value: RoomClosureValues,
) {
  return (
    value.starts === saved.starts &&
    value.ends === saved.ends &&
    value.reason.trim() === (saved.reason ?? "")
  );
}

export function closurePayload(value: RoomClosureValues) {
  return {
    starts: value.starts,
    ends: value.ends,
    reason: value.reason.trim() || undefined,
  };
}

export function closureFieldErrors(cause: unknown): Record<string, string> | null {
  if (!(cause instanceof ApiError)) return null;
  if (
    cause.code === "room has a stay on those dates" ||
    cause.code === "room is already closed on those dates" ||
    cause.code === "no availability"
  )
    return { ends: cause.message };
  if (cause.code === "stay cannot be longer than 60 nights")
    return { ends: "El cierre no puede superar las 60 noches." };
  if (cause.code === "stay must be at least one night")
    return { ends: "La reapertura debe ser posterior al inicio del cierre." };
  return null;
}
