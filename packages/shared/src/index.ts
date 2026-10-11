import { z } from 'zod'

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')

const text = (max: number) => z.string().trim().min(1).max(max)

export const guestFields = z.object({
  fullName: text(200),
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'invalid email')
    .optional(),
  phone: text(40).optional(),
  documentType: text(40).optional(),
  documentNumber: text(60).optional(),
  notes: text(2000).optional(),
})

export const lineFields = z.object({
  roomTypeId: z.string().min(1),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).optional(),
  nightlyRateCents: z.number().int().min(0).optional(),
  discountCents: z.number().int().min(0).optional(),
})

export const createReservationSchema = z
  .object({
    guestId: z.string().min(1).optional(),
    guest: guestFields.optional(),
    checkIn: dateSchema,
    checkOut: dateSchema,
    notes: text(2000).optional(),
    rooms: z.array(lineFields).min(1).max(60),
  })
  .refine((value) => Boolean(value.guestId) !== Boolean(value.guest), {
    message: 'send a guestId or a guest',
  })

const patchReservationRoomSchema = z
  .object({
    id: z.string().min(1),
    nightlyRateCents: z.number().int().min(0).optional(),
    discountCents: z.number().int().min(0).optional(),
    adults: z.number().int().min(1).optional(),
    children: z.number().int().min(0).optional(),
  })
  .refine(
    (value) =>
      value.nightlyRateCents !== undefined ||
      value.discountCents !== undefined ||
      value.adults !== undefined ||
      value.children !== undefined,
    { message: 'send a field to update' },
  )

export const patchReservationSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  checkIn: dateSchema.optional(),
  checkOut: dateSchema.optional(),
  rooms: z.array(patchReservationRoomSchema).optional(),
})

export const addRoomSchema = lineFields

export const assignRoomSchema = z.object({
  roomId: z.string().min(1),
})

export const paymentSchema = z.object({
  amountCents: z
    .number()
    .int()
    .refine((value) => value !== 0, 'amount cannot be zero'),
  method: z.enum(['cash', 'card', 'transfer', 'yape', 'other']),
  reference: text(200).toUpperCase().optional(),
  paidAt: z.string().min(1).optional(),
  notes: text(2000).optional(),
})

export const roomTypeSchema = z.object({
  name: text(80),
  maxOccupancy: z.number().int().min(1),
  baseRateCents: z.number().int().min(0),
})

export const patchRoomTypeSchema = roomTypeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'send a field to update',
  })

export const roomSchema = z.object({
  number: text(20),
  roomTypeId: z.string().min(1),
})

export const patchRoomSchema = z
  .object({
    number: text(20).optional(),
    roomTypeId: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'send a field to update' })

export const rateWriteSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  priceCents: z.number().int().min(0),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
})

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).optional(),
})

export const availabilityQuerySchema = z.object({
  checkIn: dateSchema,
  checkOut: dateSchema.optional(),
  roomTypeId: z.string().min(1).optional(),
})

export const paymentListQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
})

export const roomListQuerySchema = z.object({
  roomTypeId: z.string().min(1).optional(),
})

export const rateRangeQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
})

export const roomClosureSchema = z.object({
  roomId: z.string().min(1),
  starts: dateSchema,
  ends: dateSchema,
  reason: z.string().trim().max(80).optional(),
})

export const patchRoomClosureSchema = z.object({
  starts: dateSchema,
  ends: dateSchema,
  reason: z.string().trim().max(80).nullable().optional(),
})

export const roomClosureListQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  roomId: z.string().min(1).optional(),
})

export const reservationListQuerySchema = listQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  checkIn: dateSchema.optional(),
  status: z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']).optional(),
  guestId: z.string().min(1).optional(),
})

export type GuestInput = z.infer<typeof guestFields>
export type ReservationLineInput = z.infer<typeof lineFields>
export type CreateReservationInput = z.infer<typeof createReservationSchema>
export type PatchReservationInput = z.infer<typeof patchReservationSchema>
export type AssignRoomInput = z.infer<typeof assignRoomSchema>
export type PaymentInput = z.infer<typeof paymentSchema>
export type RoomTypeInput = z.infer<typeof roomTypeSchema>
export type PatchRoomTypeInput = z.infer<typeof patchRoomTypeSchema>
export type RoomInput = z.infer<typeof roomSchema>
export type PatchRoomInput = z.infer<typeof patchRoomSchema>
export type RateWriteInput = z.infer<typeof rateWriteSchema>
export type RoomClosureInput = z.infer<typeof roomClosureSchema>
export type PatchRoomClosureInput = z.infer<typeof patchRoomClosureSchema>

const cents = z.number().int().min(1).max(1000000000)
const reason = text(2000)
export const financialInputSchema = z
  .object({
    kind: z.enum(['payment', 'refund', 'discount', 'waiver']),
    amountCents: cents,
    reason: reason.optional(),
    method: z.enum(['cash', 'card', 'transfer', 'yape', 'other']).optional(),
    occurredAt: z.iso.datetime().optional(),
    paymentDate: z.iso.date().optional(),
    reference: text(200).toUpperCase().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (['refund', 'waiver'].includes(v.kind) && !v.reason)
      ctx.addIssue({ code: 'custom', message: 'reason is required' })
    if (['payment', 'refund'].includes(v.kind) && !v.method)
      ctx.addIssue({ code: 'custom', message: 'method is required' })
    if (v.kind === 'payment' && !v.paymentDate)
      ctx.addIssue({ code: 'custom', message: 'payment date is required' })
  })
const workflowRoom = z
  .object({
    roomTypeId: z.string().min(1),
    roomId: z.string().min(1).nullable().optional(),
    adults: z.number().int().min(1).max(100),
    children: z.number().int().min(0).max(100),
    checkIn: dateSchema,
    checkOut: dateSchema,
    nightlyRateCents: z.number().int().min(0).max(1000000000).optional(),
  })
  .strict()
export const contactSchema = guestFields
  .extend({
    email: guestFields.shape.email.unwrap().nullable(),
    phone: text(40).nullable(),
    documentType: text(40).nullable().optional(),
    documentNumber: text(60).nullable().optional(),
  })
  .omit({ notes: true })
  .strict()
export const stayingGuestSchema = contactSchema.extend({
  id: z.uuid(),
  reservationRoomId: z.string().min(1).nullable(),
})
export const workflowActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('contact'), contact: contactSchema }).strict(),
  z
    .object({ type: z.literal('set-guests'), guests: z.array(stayingGuestSchema).max(200) })
    .strict(),
  z
    .object({
      type: z.literal('edit-room'),
      lineId: z.string(),
      room: workflowRoom.omit({ nightlyRateCents: true }),
    })
    .strict(),
  z.object({ type: z.literal('add-room'), room: workflowRoom }).strict(),
  z.object({ type: z.literal('check-in'), lineIds: z.array(z.string()).min(1).max(60) }).strict(),
  z.object({ type: z.literal('check-out'), lineIds: z.array(z.string()).min(1).max(60) }).strict(),
  z.object({ type: z.literal('move'), lineId: z.string(), roomId: z.string() }).strict(),
  z
    .object({
      type: z.literal('undo-check-in'),
      lineId: z.string(),
      reason,
      guestsNotArrived: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal('cancel-room'),
      lineId: z.string(),
      reason: z.string().trim().max(2000).optional(),
      accidental: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal('no-show'), lineId: z.string(), reason: reason.optional() }).strict(),
  z
    .object({
      type: z.literal('cancel'),
      reason: z.string().trim().max(2000).optional(),
      confirmed: z.literal(true),
    })
    .strict(),
  z.object({ type: z.literal('financial'), entry: financialInputSchema }).strict(),
  z
    .object({
      type: z.literal('correct-financial'),
      entryId: z.string(),
      reason,
      replacement: financialInputSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('set-status'),
      lineId: z.string().min(1),
      status: z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']),
    })
    .strict(),
  z
    .object({
      type: z.literal('edit-financial'),
      entryId: z.string().min(1),
      entry: financialInputSchema,
    })
    .strict(),
  z.object({ type: z.literal('delete-financial'), entryId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('notes'), notes: z.string().max(2000) }).strict(),
])
export const workflowCommandSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().min(0),
    actions: z.array(workflowActionSchema).min(1).max(60),
  })
  .strict()
export const workflowCreateSchema = z
  .object({
    requestId: z.uuid(),
    guest: guestFields,
    rooms: z.array(workflowRoom).min(1).max(60),
    notes: z.string().max(2000).optional(),
  })
  .strict()
export type WorkflowAction = z.infer<typeof workflowActionSchema>
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>
export type WorkflowCreate = z.infer<typeof workflowCreateSchema>
