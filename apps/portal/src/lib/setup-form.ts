import { z } from "zod";
import type { Room, RoomType } from "./api";
import { formatMajor, parseMajorToCents } from "./money";

export const setupFormSchema = z
  .object({
    name: z.string().trim().min(1, "Indica el nombre del tipo.").max(80, "Máximo 80 caracteres."),
    baseRate: z
      .string()
      .refine(
        (value) => parseMajorToCents(value) !== null,
        "Ingresa una tarifa válida con hasta dos decimales.",
      ),
    maxOccupancy: z
      .string()
      .refine(
        (value) => value.trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 1,
        "Ingresa una capacidad entera de al menos 1 persona.",
      ),
    rooms: z.array(
      z.object({
        key: z.string(),
        id: z.string().optional(),
        number: z
          .string()
          .trim()
          .min(1, "Indica el número de habitación.")
          .max(20, "Máximo 20 caracteres."),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    const counts = new Map<string, number>();
    for (const room of value.rooms) counts.set(room.number, (counts.get(room.number) ?? 0) + 1);
    value.rooms.forEach((room, index) => {
      if (room.number && counts.get(room.number)! > 1)
        ctx.addIssue({
          code: "custom",
          path: ["rooms", index, "number"],
          message: "Este número de habitación está repetido.",
        });
    });
  });

export type SetupValues = z.input<typeof setupFormSchema>;

export function setupDefaults(type?: RoomType, rooms: Room[] = []): SetupValues {
  return {
    name: type?.name ?? "",
    baseRate: type ? formatMajor(type.baseRateCents) : "",
    maxOccupancy: String(type?.maxOccupancy ?? 1),
    rooms: rooms.map((room) => ({ key: room.id, id: room.id, number: room.number })),
  };
}
