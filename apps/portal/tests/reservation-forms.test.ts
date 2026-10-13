import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { FormApi, FieldApi } from "@tanstack/react-form"
import { ApiError, serverFieldErrors } from "../src/lib/api-error.ts"
import {
  capacityMessage,
  detailsSchema,
  discountSchema,
  guestSchema,
  guestPayload,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  schemaErrors,
  workflowDrafts,
  type DetailsValues,
} from "../src/lib/reservation-form-schemas.ts"
import { setServerErrors } from "../src/lib/form-errors.ts"
import { blurThenChange } from "../src/lib/reservation-form-state.ts"
import { createWorkflowSaver } from "../src/lib/workflow-save.ts"
import { roomEdits } from "../src/lib/reservation-editor.ts"
import type { ReservationDetail, WorkflowCommand } from "../src/lib/api.ts"

const types = [
  { id: "double", name: "Doble", maxOccupancy: 2 },
  { id: "family", name: "Familiar", maxOccupancy: 4 },
]
const details = (): DetailsValues => ({
  checkIn: "2026-01-01",
  checkOut: "2026-01-02",
  status: "confirmed",
  notes: "",
  rooms: [
    {
      id: "line-1",
      removed: false,
      room: { roomTypeId: "double", roomId: null, adults: "1", children: "0" },
    },
  ],
})

describe("reservation form schemas", () => {
  it("places capacity errors on the affected room and revalidates a type change", () => {
    const values = details()
    values.rooms.push({
      id: "line-2",
      removed: false,
      room: { roomTypeId: "double", roomId: null, adults: "2", children: "1" },
    })
    assert.deepEqual(schemaErrors(detailsSchema(types).safeParse(values)), {
      "rooms[1].room": capacityMessage,
    })
    values.rooms[1].room.roomTypeId = "family"
    assert.equal(detailsSchema(types).safeParse(values).success, true)
  })
  it("ignores removed room validation but still emits its workflow removal", () => {
    const values = details()
    values.rooms.push({
      id: "line-2",
      removed: true,
      room: { roomTypeId: "", roomId: null, adults: "", children: "" },
    })
    assert.equal(detailsSchema(types).safeParse(values).success, true)
    const saved = {
      rooms: [
        { id: "line-1", ...workflowDrafts(values)[0].room },
        { id: "line-2" },
      ],
    } as ReservationDetail
    assert.deepEqual(roomEdits(saved, workflowDrafts(values)), [
      { type: "remove-room", lineId: "line-2" },
    ])
    values.rooms[0].removed = true
    assert.ok(schemaErrors(detailsSchema(types).safeParse(values)).rooms)
  })
  it("rejects blank, fractional and out-of-range counts instead of coercing them", () => {
    for (const invalid of ["", " ", "1.5", "-1", "101", "NaN"]) {
      const values = details()
      values.rooms[0].room.children = invalid
      assert.ok(
        schemaErrors(detailsSchema(types).safeParse(values))[
          "rooms[0].room.children"
        ],
        invalid
      )
    }
    assert.equal(detailsSchema(types).safeParse(details()).success, true)
  })
  it("validates real dates and the 1–60 night stay boundary", () => {
    const values = details()
    for (const checkOut of [
      "2026-01-01",
      "2025-12-31",
      "2026-02-30",
      "2026-03-03",
    ])
      assert.equal(
        detailsSchema(types).safeParse({ ...values, checkOut }).success,
        false,
        checkOut
      )
    assert.equal(
      detailsSchema(types).safeParse({ ...values, checkOut: "2026-03-02" })
        .success,
      true
    )
  })
  it("requires physical assignments on check-in and rejects duplicate assignments", () => {
    const values = details()
    values.status = "checked_in"
    assert.ok(
      schemaErrors(detailsSchema(types).safeParse(values))[
        "rooms[0].room.roomId"
      ]
    )
    values.rooms[0].room.roomId = "room-1"
    assert.equal(detailsSchema(types).safeParse(values).success, true)
    values.rooms.push({ ...structuredClone(values.rooms[0]), id: "line-2" })
    assert.ok(
      schemaErrors(detailsSchema(types).safeParse(values))[
        "rooms[1].room.roomId"
      ]
    )
  })
  it("normalizes optional guest fields only when creating the command", () => {
    const values = {
      id: "9b73e6c7-c684-4c4b-a205-b63e3c91a839",
      fullName: " Ana Pérez ",
      email: " ana@example.com ",
      phone: " ",
      documentType: "",
      documentNumber: "",
      reservationRoomId: null,
    }
    assert.equal(
      guestSchema.safeParse({ ...values, fullName: " " }).success,
      false
    )
    assert.deepEqual(guestPayload(values), {
      ...values,
      fullName: "Ana Pérez",
      email: "ana@example.com",
      phone: null,
      documentType: null,
      documentNumber: null,
    })
    assert.equal(values.fullName, " Ana Pérez ")
  })
  it("enforces payment precision, limits and actual UTC dates", () => {
    const values = {
      ...paymentDefaults(),
      amount: " 10.25 ",
      date: "2020-01-01",
      reference: " abc ",
      reason: " nota ",
    }
    assert.deepEqual(paymentPayload(values), {
      amountCents: 1025,
      method: "cash",
      paymentDate: "2020-01-01",
      reference: "ABC",
      notes: "nota",
    })
    for (const amount of ["", "0", "-1", "1.001", "10000000.01"])
      assert.equal(
        paymentSchema.safeParse({ ...values, amount }).success,
        false,
        amount
      )
    assert.equal(
      paymentSchema.safeParse({ ...values, date: "2020-02-30" }).success,
      false
    )
    assert.equal(
      paymentSchema.safeParse({ ...values, date: "9999-01-01" }).success,
      false
    )
    assert.equal(discountSchema.safeParse({ amount: "" }).success, true)
    assert.equal(discountSchema.safeParse({ amount: "-1" }).success, false)
  })
})

describe("TanStack form lifecycle", () => {
  it("validates on blur, then on change after a failed submission", async () => {
    let writes = 0
    const form = new FormApi({
      defaultValues: paymentDefaults(),
      validationLogic: blurThenChange(),
      validators: { onDynamic: paymentSchema },
      onSubmit: () => {
        writes++
      },
    })
    const unmount = form.mount()
    const field = new FieldApi({ form, name: "amount" })
    const unmountField = field.mount()
    field.handleChange("0")
    assert.equal(field.state.meta.errors.length, 0)
    field.handleBlur()
    assert.ok(field.state.meta.errors.length)
    await form.handleSubmit()
    assert.equal(writes, 0)
    field.handleChange("10.25")
    assert.equal(field.state.meta.errors.length, 0)
    await form.handleSubmit()
    assert.equal(writes, 1)
    unmountField()
    unmount()
  })
  it("recognizes reverted values as clean and resets the saved baseline", () => {
    const form = new FormApi({ defaultValues: { notes: "original" } })
    const unmount = form.mount()
    const field = new FieldApi({ form, name: "notes" })
    const unmountField = field.mount()
    field.handleChange("changed")
    assert.equal(form.state.isDefaultValue, false)
    field.handleChange("original")
    assert.equal(form.state.isDirty, true)
    assert.equal(form.state.isDefaultValue, true)
    form.reset({ notes: "saved" })
    assert.equal(form.state.values.notes, "saved")
    assert.equal(form.state.isDefaultValue, true)
    unmountField()
    unmount()
  })
  it("attaches server validation to the field and clears it when that field changes", () => {
    const form = new FormApi({
      defaultValues: paymentDefaults(),
      validationLogic: blurThenChange(),
      validators: { onDynamic: paymentSchema },
    })
    const unmount = form.mount()
    const field = new FieldApi({ form, name: "date" })
    const unmountField = field.mount()
    const error = new ApiError(400, "payment date cannot be in the future")
    assert.equal(error.code, "payment date cannot be in the future")
    assert.equal(error.status, 400)
    setServerErrors(form, serverFieldErrors(error, "payment")!)
    assert.deepEqual(field.state.meta.errors, [
      "La fecha del pago no puede ser futura.",
    ])
    field.handleChange("2020-01-01")
    assert.equal(field.state.meta.errors.length, 0)
    assert.equal(
      serverFieldErrors(new Error("Network failure"), "payment"),
      null
    )
    assert.equal(
      serverFieldErrors(
        new ApiError(409, "too many guests for this room type"),
        "details"
      ),
      null
    )
    unmountField()
    unmount()
  })
  it("preserves failed payment values and reuses the retry command", async () => {
    const saver = createWorkflowSaver()
    const commands: WorkflowCommand[] = []
    const defaults = { ...paymentDefaults(), amount: "10.25" }
    const form = new FormApi({
      defaultValues: defaults,
      validators: { onSubmit: paymentSchema },
      onSubmit: async ({ value }) => {
        try {
          await saver(
            [{ type: "add-payment", payment: paymentPayload(value) }],
            async (command) => {
              commands.push(command)
              if (commands.length === 1) throw new Error("Lost response")
            }
          )
          form.reset(paymentDefaults())
        } catch {
          /* Preserve the draft for an explicit retry. */
        }
      },
    })
    const unmount = form.mount()
    await form.handleSubmit()
    assert.equal(form.state.values.amount, "10.25")
    await form.handleSubmit()
    assert.deepEqual(commands[0], commands[1])
    assert.equal(form.state.values.amount, "")
    unmount()
  })
})
