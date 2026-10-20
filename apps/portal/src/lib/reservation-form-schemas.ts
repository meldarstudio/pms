import { z } from "zod";
import type { PaymentInput, ReservationDetail, RoomType, StayingGuest } from "./api.ts";
import { formatMajor, parseMajorToCents } from "./money.ts";
import type { RoomDraft } from "./reservation-editor.ts";
import { propertyToday } from "./property-calendar.ts";

const optionalText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);
const date = z.iso.date({ error: "Indica una fecha válida." });
const status = z.enum(["confirmed", "checked_in", "checked_out", "cancelled"]);
const count = (min: number, message: string) =>
  z
    .string()
    .refine(
      (value) =>
        value.trim() !== "" &&
        Number.isSafeInteger(Number(value)) &&
        Number(value) >= min &&
        Number(value) <= 100,
      message,
    );
const room = z.object({
  id: z.string(),
  removed: z.boolean(),
  room: z.object({
    roomTypeId: z.string(),
    roomId: z.string().nullable(),
    adults: z.string(),
    children: z.string(),
  }),
});
export const capacityMessage = "La habitación no tiene capacidad para todos los huéspedes.";
export const detailsSchema = (
  types: RoomType[],
  {
    validateOperations = true,
    saved,
  }: {
    validateOperations?: boolean;
    saved?: Pick<ReservationDetail, "checkIn" | "checkOut" | "status" | "rooms">;
  } = {},
) =>
  z
    .object({
      checkIn: date,
      checkOut: date,
      status: status.optional(),
      notes: z.string().max(2000, "Máximo 2000 caracteres."),
      rooms: z.array(room),
    })
    .superRefine((value, ctx) => {
      const nights =
        (Date.parse(`${value.checkOut}T00:00:00Z`) - Date.parse(`${value.checkIn}T00:00:00Z`)) /
        86400000;
      if (nights < 1 || nights > 60)
        ctx.addIssue({
          code: "custom",
          path: ["checkOut"],
          message:
            nights < 1
              ? "La estancia debe tener al menos una noche."
              : "La estancia no puede superar las 60 noches.",
        });
      const active = value.rooms.filter((draft) => !draft.removed);
      if (!active.length || active.length > 60)
        ctx.addIssue({
          code: "custom",
          path: ["rooms"],
          message: "La reserva debe tener entre 1 y 60 habitaciones.",
        });
      const assignments = new Set<string>();
      const revalidateAll =
        !saved ||
        value.checkIn !== saved.checkIn ||
        value.checkOut !== saved.checkOut ||
        (saved.status === "cancelled" && !!value.status && value.status !== "cancelled");
      value.rooms.forEach((draft, index) => {
        if (draft.removed) return;
        const path = ["rooms", index, "room"];
        const type = types.find((type) => type.id === draft.room.roomTypeId);
        if (!draft.room.roomTypeId || (types.length && !type))
          ctx.addIssue({
            code: "custom",
            path: [...path, "roomTypeId"],
            message: "Selecciona un tipo de habitación válido.",
          });
        const adults = count(1, "Ingresa entre 1 y 100 adultos.").safeParse(draft.room.adults);
        const children = count(0, "Ingresa entre 0 y 100 niños.").safeParse(draft.room.children);
        if (!adults.success)
          ctx.addIssue({
            code: "custom",
            path: [...path, "adults"],
            message: adults.error.issues[0].message,
          });
        if (!children.success)
          ctx.addIssue({
            code: "custom",
            path: [...path, "children"],
            message: children.error.issues[0].message,
          });
        const previous = saved?.rooms.find((room) => room.id === draft.id);
        const changed =
          !previous ||
          draft.room.roomTypeId !== previous.roomTypeId ||
          draft.room.roomId !== previous.roomId ||
          Number(draft.room.adults) !== previous.adults ||
          Number(draft.room.children) !== previous.children;
        if (
          validateOperations &&
          (revalidateAll || changed) &&
          adults.success &&
          children.success &&
          type &&
          (Number(draft.room.adults) > type.maxAdults ||
            Number(draft.room.children) > type.maxChildren)
        )
          ctx.addIssue({ code: "custom", path, message: capacityMessage });
        if (draft.room.roomId) {
          if (validateOperations && assignments.has(draft.room.roomId))
            ctx.addIssue({
              code: "custom",
              path: [...path, "roomId"],
              message: "Esta habitación ya está seleccionada en la reserva.",
            });
          assignments.add(draft.room.roomId);
        }
      });
    });
export type DetailsValues = z.input<ReturnType<typeof detailsSchema>>;
export const emptyDetails: DetailsValues = {
  checkIn: "",
  checkOut: "",
  notes: "",
  rooms: [],
};
export function detailsDefaults(detail: ReservationDetail): DetailsValues {
  return {
    checkIn: detail.checkIn,
    checkOut: detail.checkOut,
    status: status.parse(detail.status),
    notes: detail.notes ?? "",
    rooms: detail.rooms.map((room) => ({
      id: room.id,
      removed: false,
      room: {
        roomTypeId: room.roomTypeId,
        roomId: room.roomId,
        adults: String(room.adults),
        children: String(room.children),
      },
    })),
  };
}
export function workflowDrafts(values: DetailsValues): RoomDraft[] {
  return values.rooms.map((draft) => ({
    ...draft,
    room: {
      ...draft.room,
      adults: Number(draft.room.adults),
      children: Number(draft.room.children),
    },
  }));
}

// Preview room order follows the retained rooms, then the added rooms.
export function detailsSummaryRooms(
  values: DetailsValues,
  pricedRooms: ReservationDetail["rooms"] | undefined,
) {
  return values.rooms
    .filter((draft) => !draft.removed)
    .map((draft, index) => {
      const priced = pricedRooms?.[index];
      const adults = count(1, "").safeParse(draft.room.adults);
      const children = count(0, "").safeParse(draft.room.children);
      return {
        key: draft.id,
        roomTypeId: draft.room.roomTypeId,
        roomTypeName: priced?.roomTypeName,
        adults: adults.success ? Number(adults.data) : null,
        children: children.success ? Number(children.data) : null,
        charges: priced
          ? {
              subtotalCents: priced.subtotalCents,
              discountCents: priced.discountCents,
              totalCents: priced.totalCents,
            }
          : null,
      };
    });
}
export const guestSchema = z.object({
  id: z.uuid(),
  fullName: z
    .string()
    .trim()
    .min(1, "Ingresa el nombre completo.")
    .max(200, "Máximo 200 caracteres."),
  email: optionalText(320).refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Ingresa un correo válido.",
  ),
  phone: optionalText(40),
  documentType: optionalText(40),
  documentNumber: optionalText(60),
  reservationRoomId: z.string().nullable(),
});
export type GuestValues = z.input<typeof guestSchema>;
export const contactSchema = guestSchema.pick({ fullName: true, phone: true, email: true });
export function contactDefaults(detail: ReservationDetail) {
  return {
    fullName: detail.guest.fullName,
    phone: detail.guest.phone ?? "",
    email: detail.guest.email ?? "",
  };
}
export function contactPayload(values: z.input<typeof contactSchema>) {
  const parsed = contactSchema.parse(values);
  return {
    ...parsed,
    phone: parsed.phone || null,
    email: parsed.email || null,
  };
}
export const notesSchema = z.object({ notes: z.string().max(2000, "Máximo 2000 caracteres.") });
export function guestDefaults(guest: StayingGuest): GuestValues {
  return {
    ...guest,
    email: guest.email ?? "",
    phone: guest.phone ?? "",
    documentType: guest.documentType ?? "",
    documentNumber: guest.documentNumber ?? "",
  };
}
export function guestPayload(values: GuestValues): StayingGuest {
  const parsed = guestSchema.parse(values);
  return {
    ...parsed,
    email: parsed.email || null,
    phone: parsed.phone || null,
    documentType: parsed.documentType || null,
    documentNumber: parsed.documentNumber || null,
  };
}
const money = (positive: boolean) =>
  z.string().refine(
    (value) => {
      const cents = parseMajorToCents(value.trim() || (positive ? "" : "0"));
      return cents !== null && cents >= (positive ? 1 : 0) && cents <= 1000000000;
    },
    positive
      ? "Introduce un importe positivo con hasta dos decimales, máximo S/ 10 000 000."
      : "Ingresa un importe válido con hasta dos decimales, máximo S/ 10 000 000.",
  );
export const paymentSchema = z.object({
  amount: money(true),
  method: z.enum(["cash", "card", "transfer", "yape", "plin", "other"], {
    error: "Selecciona un método de pago válido.",
  }),
  date: date.refine((value) => value <= propertyToday(), "La fecha del pago no puede ser futura."),
  reference: optionalText(200),
  reason: optionalText(2000),
});
export type PaymentValues = z.input<typeof paymentSchema>;
export function paymentDefaults(amountCents = 0): PaymentValues {
  return {
    amount: amountCents > 0 ? formatMajor(amountCents) : "",
    method: "cash",
    date: propertyToday(),
    reference: "",
    reason: "",
  };
}
export function paymentPayload(values: PaymentValues): PaymentInput {
  const parsed = paymentSchema.parse(values);
  return {
    amountCents: parseMajorToCents(parsed.amount.trim())!,
    method: parsed.method,
    paymentDate: parsed.date,
    ...(parsed.reference ? { reference: parsed.reference.toUpperCase() } : {}),
    ...(parsed.reason ? { notes: parsed.reason } : {}),
  };
}
export const discountSchema = z.object({ amount: money(false) });
export const newBookingSchema = (types: RoomType[]) =>
  z.intersection(
    detailsSchema(types),
    guestSchema
      .pick({ fullName: true, email: true, phone: true })
      .extend({ discount: discountSchema.shape.amount }),
  );
export type NewBookingValues = z.input<ReturnType<typeof newBookingSchema>>;
export const cancellationSchema = z.object({ reason: optionalText(2000) });

export function schemaErrors(
  result: ReturnType<ReturnType<typeof detailsSchema>["safeParse"]>,
): Record<string, string> {
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [
      issue.path.reduce<string>(
        (path, part) =>
          typeof part === "number"
            ? `${path}[${part}]`
            : path
              ? `${path}.${String(part)}`
              : String(part),
        "",
      ),
      issue.message,
    ]),
  );
}
