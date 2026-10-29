import { z } from "zod";
export { normalizePhone, phoneErrors } from "./phone";

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

export const housekeepingMarksSchema = z.object({
  marks: z
    .array(z.object({ roomId: z.string().min(1), status: z.enum(["dirty", "clean"]) }))
    .min(1)
    .max(500)
    .refine((marks) => new Set(marks.map((mark) => mark.roomId)).size === marks.length, {
      message: "duplicate room in housekeeping marks",
    }),
});

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

const newPasswordSchema = z
  .string()
  .min(12, "password must be at least 12 characters")
  .max(128, "password must be at most 128 characters");

export const accountPasswordSchema = z.object({ password: newPasswordSchema }).strict();

export const ownPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "current password is required").max(500),
    newPassword: newPasswordSchema,
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

export const calendarQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
});

const staffStatusSchema = z.enum([
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
]);
const reservationStatusSchema = z.enum([...staffStatusSchema.options, "unfulfilled"]);

export const reservationListQuerySchema = listQuerySchema.extend({
  paginated: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  checkIn: z.iso.date({ error: "Invalid input: expected a valid check-in date" }).optional(),
  checkOut: z.iso.date({ error: "Invalid input: expected a valid checkout date" }).optional(),
  status: reservationStatusSchema.optional(),
  statuses: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(reservationStatusSchema).min(1))
    .optional(),
  balance: z.enum(["outstanding", "settled", "credit"]).optional(),
  refund: z.enum(["due", "requested"]).optional(),
  assignment: z.enum(["assigned", "unassigned"]).optional(),
  sort: z.enum(["checkIn", "checkOut", "guestName", "balance"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  guestId: z.string().min(1).optional(),
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
      status: staffStatusSchema,
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
  z
    .object({
      type: z.literal("waive-cancellation-charge"),
      amountCents: cents,
      reason: text(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("request-refund"),
      paymentId: z.string().min(1),
      amountCents: cents,
      method: paymentInputSchema.shape.method,
      reference: text(200).toUpperCase().optional(),
      reason: text(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("request-culqi-refund"),
      paymentId: z.string().min(1),
      amountCents: cents,
      reason: text(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("complete-refund"),
      refundId: z.string().min(1),
      refundDate: z.iso.date(),
      reference: text(200).toUpperCase(),
    })
    .strict(),
  z
    .object({ type: z.literal("fail-refund"), refundId: z.string().min(1), reason: text(2000) })
    .strict(),
  z.object({ type: z.literal("notes"), notes: z.string().max(2000) }).strict(),
]);
export const workflowCommandSchema = z
  .object({
    requestId: z.uuid(),
    actions: z.array(workflowActionSchema).min(1).max(60),
  })
  .strict();
export const ratePlanCodeSchema = z.enum(["flexible", "non_refundable"], {
  error: "unknown rate plan",
});
export const workflowCreateSchema = z
  .object({
    requestId: z.uuid(),
    guest: guestFields,
    checkIn: dateSchema,
    checkOut: dateSchema,
    rooms: z.array(workflowRoom).min(1).max(60),
    notes: z.string().max(2000).optional(),
    discountCents: z.number().int().min(0).max(1000000000).optional(),
    ratePlan: ratePlanCodeSchema.optional(),
  })
  .strict();
export const workflowCreatePreviewSchema = workflowCreateSchema
  .pick({ checkIn: true, checkOut: true, discountCents: true, ratePlan: true })
  .extend({
    rooms: z
      .array(workflowRoom.pick({ roomTypeId: true, nightlyRateCents: true }))
      .min(1)
      .max(60),
  })
  .strict();
export const quoteCreateSchema = workflowRoom
  .pick({ roomTypeId: true, adults: true, children: true })
  .extend({ checkIn: dateSchema, checkOut: dateSchema, ratePlan: ratePlanCodeSchema })
  .strict();
export type WorkflowAction = z.infer<typeof workflowActionSchema>;
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export type WorkflowCreate = z.infer<typeof workflowCreateSchema>;
export type WorkflowCreatePreview = z.infer<typeof workflowCreatePreviewSchema>;
export type QuoteCreate = z.infer<typeof quoteCreateSchema>;
export const paymentAttemptCreateSchema = z
  .object({
    quoteId: z.uuid(),
    sourceId: z.string().trim().min(1).max(200),
    deviceFingerprint: z.string().trim().min(1).max(200).optional(),
    guest: guestFields.omit({ notes: true }).extend({ email: guestFields.shape.email.unwrap() }),
  })
  .strict();
export const paymentAuthenticationSchema = z
  .object({
    eci: z.string().max(10),
    xid: z.string().max(200).optional(),
    cavv: z.string().max(200),
    protocolVersion: z.string().max(20),
    directoryServerTransactionId: z.string().max(200),
  })
  .strict();
export type PaymentAttemptCreate = z.infer<typeof paymentAttemptCreateSchema>;
export type PaymentAuthentication = z.infer<typeof paymentAuthenticationSchema>;
