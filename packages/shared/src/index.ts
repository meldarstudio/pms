import { z } from "zod";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const text = (max: number) => z.string().trim().min(1).max(max);

export const guestFields = z.object({
  fullName: text(200),
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "invalid email")
    .optional(),
  phone: text(40).optional(),
  documentType: text(40).optional(),
  documentNumber: text(60).optional(),
  notes: text(2000).optional(),
});

export const roomTypeSchema = z.object({
  name: text(80),
  maxAdults: z.number().int().min(1),
  maxChildren: z.number().int().min(0),
  baseRateCents: z.number().int().min(0),
});

export const patchRoomTypeSchema = roomTypeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "send a field to update",
  });

export const roomSchema = z.object({
  number: text(20),
  roomTypeId: z.string().min(1),
});

export const propertySetupSchema = roomTypeSchema
  .extend({
    roomTypeId: z.string().min(1).optional(),
    rooms: z.array(z.object({ id: z.string().min(1).optional(), number: text(20) })),
  })
  .refine(
    (value) => {
      const ids = value.rooms.flatMap((room) => (room.id ? [room.id] : []));
      return new Set(ids).size === ids.length;
    },
    { message: "room appears more than once" },
  );

export const patchRoomSchema = z
  .object({
    number: text(20).optional(),
    roomTypeId: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "send a field to update" });

export const rateWriteSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  priceCents: z.number().int().min(0),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
});

export const loginSchema = z
  .object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(500),
  })
  .strict();

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).optional(),
});

export const availabilityQuerySchema = z.object({
  checkIn: dateSchema,
  checkOut: dateSchema.optional(),
  roomTypeId: z.string().min(1).optional(),
  adults: z.coerce.number().int().min(1).max(100).optional(),
  children: z.coerce.number().int().min(0).max(100).optional(),
});

export const paymentListQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
});

export const roomListQuerySchema = z.object({
  roomTypeId: z.string().min(1).optional(),
});

export const rateRangeQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
});

export const roomClosureSchema = z.object({
  roomId: z.string().min(1),
  starts: dateSchema,
  ends: dateSchema,
  reason: z.string().trim().max(80).optional(),
});

export const patchRoomClosureSchema = z.object({
  starts: dateSchema,
  ends: dateSchema,
  reason: z.string().trim().max(80).nullable().optional(),
});

export const roomClosureListQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  roomId: z.string().min(1).optional(),
});

export const reservationListQuerySchema = listQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  checkIn: dateSchema.optional(),
  checkOut: dateSchema.optional(),
  status: z.enum(["confirmed", "checked_in", "checked_out", "cancelled"]).optional(),
  statuses: z
    .string()
    .refine((value) =>
      value
        .split(",")
        .every((status) =>
          ["confirmed", "checked_in", "checked_out", "cancelled"].includes(status),
        ),
    )
    .optional(),
  guestId: z.string().min(1).optional(),
  balance: z.enum(["outstanding", "settled", "credit"]).optional(),
  assignment: z.enum(["assigned", "unassigned"]).optional(),
  sort: z.enum(["checkIn", "checkOut", "guestName", "balance"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  paginated: z.enum(["true"]).optional(),
});

export type GuestInput = z.infer<typeof guestFields>;
export type RoomTypeInput = z.infer<typeof roomTypeSchema>;
export type PatchRoomTypeInput = z.infer<typeof patchRoomTypeSchema>;
export type RoomInput = z.infer<typeof roomSchema>;
export type PatchRoomInput = z.infer<typeof patchRoomSchema>;
export type RateWriteInput = z.infer<typeof rateWriteSchema>;
export type RoomClosureInput = z.infer<typeof roomClosureSchema>;
export type PatchRoomClosureInput = z.infer<typeof patchRoomClosureSchema>;

const cents = z.number().int().min(1).max(1000000000);
export const paymentInputSchema = z
  .object({
    amountCents: cents,
    method: z.enum(["cash", "card", "transfer", "yape", "plin", "other"]),
    paymentDate: z.iso.date(),
    reference: text(200).toUpperCase().optional(),
    notes: text(2000).optional(),
  })
  .strict();
const workflowRoom = z
  .object({
    roomTypeId: z.string().min(1),
    roomId: z.string().min(1).nullable().optional(),
    adults: z.number().int().min(1).max(100),
    children: z.number().int().min(0).max(100),
    nightlyRateCents: z.number().int().min(0).max(1000000000).optional(),
  })
  .strict();
export const contactSchema = guestFields
  .extend({
    email: guestFields.shape.email.unwrap().nullable(),
    phone: text(40).nullable(),
    documentType: text(40).nullable().optional(),
    documentNumber: text(60).nullable().optional(),
  })
  .omit({ notes: true })
  .strict();
export const stayingGuestSchema = contactSchema.extend({
  id: z.uuid(),
  reservationRoomId: z.string().min(1).nullable(),
});
export const workflowActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("contact"), contact: contactSchema }).strict(),
  z
    .object({ type: z.literal("set-guests"), guests: z.array(stayingGuestSchema).max(200) })
    .strict(),
  z
    .object({
      type: z.literal("edit-room"),
      lineId: z.string(),
      room: workflowRoom.omit({ nightlyRateCents: true }),
    })
    .strict(),
  z.object({ type: z.literal("add-room"), room: workflowRoom }).strict(),
  z.object({ type: z.literal("remove-room"), lineId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("dates"), checkIn: dateSchema, checkOut: dateSchema }).strict(),
  z
    .object({
      type: z.literal("set-discount"),
      amountCents: z.number().int().min(0).max(1000000000),
    })
    .strict(),
  z.object({ type: z.literal("add-payment"), payment: paymentInputSchema }).strict(),
  z
    .object({
      type: z.literal("set-status"),
      status: z.enum(["confirmed", "checked_in", "checked_out", "cancelled"]),
      reason: z.string().trim().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("edit-payment"),
      paymentId: z.string().min(1),
      payment: paymentInputSchema,
    })
    .strict(),
  z.object({ type: z.literal("delete-payment"), paymentId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("notes"), notes: z.string().max(2000) }).strict(),
]);
export const workflowCommandSchema = z
  .object({
    requestId: z.uuid(),
    actions: z.array(workflowActionSchema).min(1).max(60),
  })
  .strict();
export const workflowCreateSchema = z
  .object({
    requestId: z.uuid(),
    guest: guestFields,
    checkIn: dateSchema,
    checkOut: dateSchema,
    rooms: z.array(workflowRoom).min(1).max(60),
    notes: z.string().max(2000).optional(),
    discountCents: z.number().int().min(0).max(1000000000).optional(),
  })
  .strict();
export type WorkflowAction = z.infer<typeof workflowActionSchema>;
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export type WorkflowCreate = z.infer<typeof workflowCreateSchema>;
