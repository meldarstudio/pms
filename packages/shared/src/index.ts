import { z } from "zod";
export { normalizePhone, phoneErrors } from "./phone";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const text = (max: number) => z.string().trim().min(1).max(max);
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const requiredText = (max: number, message: string) =>
  z
    .string({ error: (issue) => (issue.input === undefined ? message : undefined) })
    .trim()
    .min(1, message)
    .max(max);
export const nationalityCodes: ReadonlySet<string> = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  ),
);
const nationality = z.string().refine((code) => nationalityCodes.has(code), "invalid nationality");

export const guestFields = z.object({
  fullName: text(200),
  email: z.string().trim().regex(EMAIL_ADDRESS, "invalid email").optional(),
  phone: text(40).optional(),
  documentType: text(40).optional(),
  documentNumber: text(60).optional(),
  nationality: nationality.optional(),
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
  excludeReservationId: z.string().min(1).optional(),
});

export const publicOfferSearchSchema = z.object({
  checkIn: dateSchema,
  checkOut: dateSchema,
  adults: z.coerce.number().int().min(1).max(100),
  children: z.coerce.number().int().min(0).max(100),
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
  balance: z.enum(["outstanding", "settled", "credit", "unresolved"]).optional(),
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

export type PropertySetupRequest = z.input<typeof propertySetupSchema>;
export type PatchRoomRequest = z.input<typeof patchRoomSchema>;
export type HousekeepingMarksRequest = z.input<typeof housekeepingMarksSchema>;
export type RateWriteRequest = z.input<typeof rateWriteSchema>;
export type LoginRequest = z.input<typeof loginSchema>;
export type OwnPasswordRequest = z.input<typeof ownPasswordSchema>;
export type RoomClosureRequest = z.input<typeof roomClosureSchema>;
export type PatchRoomClosureRequest = z.input<typeof patchRoomClosureSchema>;

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
  })
  .strict();
export const contactSchema = guestFields
  .extend({
    email: guestFields.shape.email.unwrap().nullable(),
    phone: text(40).nullable(),
    documentType: text(40).nullable().optional(),
    documentNumber: text(60).nullable().optional(),
    nationality: nationality.nullable().optional(),
  })
  .omit({ notes: true })
  .strict();
export const stayingGuestSchema = contactSchema.omit({ nationality: true }).extend({
  id: z.uuid(),
});
export const couponCodeSchema = z
  .string()
  .transform((code) => code.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().min(1, "coupon not found").max(40, "coupon not found"));
const refundCompletionSchema = z
  .object({ refundDate: z.iso.date(), reference: text(200).toUpperCase().optional() })
  .strict();

export const workflowActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("contact"), contact: contactSchema }).strict(),
  z
    .object({ type: z.literal("set-guests"), guests: z.array(stayingGuestSchema).max(200) })
    .strict(),
  z
    .object({
      type: z.literal("edit-room"),
      lineId: z.string(),
      room: workflowRoom,
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
      completed: refundCompletionSchema.optional(),
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
      ...refundCompletionSchema.shape,
    })
    .strict(),
  z
    .object({ type: z.literal("fail-refund"), refundId: z.string().min(1), reason: text(2000) })
    .strict(),
  z
    .object({
      type: z.literal("issue-coupon"),
      amountCents: cents,
      guestAccepted: z.literal(true, { error: "guest acceptance is required" }),
    })
    .strict(),
  z
    .object({ type: z.literal("redeem-coupon"), code: couponCodeSchema, amountCents: cents })
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
      .array(workflowRoom.pick({ roomTypeId: true }))
      .min(1)
      .max(60),
  })
  .strict();
export const quoteCreateSchema = workflowRoom
  .pick({ roomTypeId: true, adults: true, children: true })
  .extend({ checkIn: dateSchema, checkOut: dateSchema, ratePlan: ratePlanCodeSchema })
  .strict();
export const checkoutLanguageSchema = z.enum(["es", "en"], { error: "unknown language" });
export const publicCheckoutCreateSchema = quoteCreateSchema
  .extend({ language: checkoutLanguageSchema })
  .strict();
const bookingContactSchema = z
  .object({
    fullName: requiredText(200, "full name is required"),
    email: requiredText(200, "email is required").regex(EMAIL_ADDRESS, "invalid email"),
    phone: requiredText(40, "phone is required"),
  })
  .strict();
export const checkoutAcceptanceSchema = z
  .object({
    quoteId: z.uuid(),
    language: checkoutLanguageSchema,
    contact: bookingContactSchema,
    agreed: z.literal(true, { error: "agreement must be accepted" }),
  })
  .strict();
export const checkoutPaymentSchema = z
  .object({
    quoteId: z.uuid(),
    sourceId: z
      .string()
      .trim()
      .regex(/^tkn_[\w-]{1,200}$/, "only card payments are accepted"),
    deviceFingerprint: z.string().trim().min(1).max(200).optional(),
    turnstileToken: requiredText(2048, "payment security check is required"),
  })
  .strict();
export const publicPaymentAdmissionSchema = z.object({ admitted: z.boolean() }).strict();
export const emailSubmissionAdmissionSchema = z.object({ admitted: z.boolean() }).strict();
export type CheckoutLanguage = z.infer<typeof checkoutLanguageSchema>;
export type PublicCheckoutCreate = z.infer<typeof publicCheckoutCreateSchema>;
export type PublicCheckoutCreateRequest = z.input<typeof publicCheckoutCreateSchema>;
export type CheckoutAcceptance = z.infer<typeof checkoutAcceptanceSchema>;
export type CheckoutPayment = z.infer<typeof checkoutPaymentSchema>;
export type PublicPaymentAdmissionRequest = z.input<typeof publicPaymentAdmissionSchema>;
export type EmailSubmissionAdmissionRequest = z.input<typeof emailSubmissionAdmissionSchema>;
export type WorkflowAction = z.infer<typeof workflowActionSchema>;
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export type WorkflowCreate = z.infer<typeof workflowCreateSchema>;
export type WorkflowCreatePreview = z.infer<typeof workflowCreatePreviewSchema>;
export type QuoteCreate = z.infer<typeof quoteCreateSchema>;
export type PaymentRequest = z.input<typeof paymentInputSchema>;
export type WorkflowRoomRequest = z.input<typeof workflowRoom>;
export type WorkflowActionRequest = z.input<typeof workflowActionSchema>;
export type WorkflowCommandRequest = z.input<typeof workflowCommandSchema>;
export type WorkflowCreateRequest = z.input<typeof workflowCreateSchema>;
export type WorkflowCreatePreviewRequest = z.input<typeof workflowCreatePreviewSchema>;
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
    eci: text(10),
    xid: text(200).optional(),
    cavv: text(200),
    protocolVersion: text(20),
    directoryServerTransactionId: text(200),
  })
  .strict();
export const checkoutAuthenticationSchema = paymentAuthenticationSchema
  .extend({ attemptId: z.uuid() })
  .strict();
export type PaymentAttemptCreate = z.infer<typeof paymentAttemptCreateSchema>;
export type PaymentAuthentication = z.infer<typeof paymentAuthenticationSchema>;
export type CheckoutAuthentication = z.infer<typeof checkoutAuthenticationSchema>;
