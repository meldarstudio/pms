import { z } from "zod"
import { ApiError } from "./api-error.ts"

export const roomEditSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "Ingresa el número.")
    .max(20, "Máximo 20 caracteres."),
  roomTypeId: z.string().min(1, "Selecciona un tipo."),
})

export type RoomEditValues = z.input<typeof roomEditSchema>

export function roomPatch(
  saved: { number: string; roomTypeId: string },
  value: RoomEditValues
) {
  const number = value.number.trim()
  const patch: { number?: string; roomTypeId?: string } = {}
  if (number && number !== saved.number) patch.number = number
  if (value.roomTypeId !== saved.roomTypeId) patch.roomTypeId = value.roomTypeId
  return number && Object.keys(patch).length ? patch : null
}

export function roomFieldErrors(cause: unknown): Record<string, string> | null {
  if (!(cause instanceof ApiError)) return null
  if (cause.code === "room number already exists")
    return { number: cause.message }
  if (
    cause.code === "room has an assigned stay" ||
    cause.code === "room type not found"
  )
    return { roomTypeId: cause.message }
  if (cause.code === "no availability")
    return {
      roomTypeId:
        "Este tipo no tendría suficientes habitaciones para las reservas existentes.",
    }
  return null
}
