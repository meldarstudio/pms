import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { FieldApi, FormApi } from "@tanstack/react-form"
import { ApiError } from "../src/lib/api-error.ts"
import { setServerErrors } from "../src/lib/form-errors.ts"
import {
  closureFieldErrors,
  closureNights,
  closurePayload,
  closureUnchanged,
  roomClosureFormSchema,
} from "../src/lib/room-closure-form.ts"

const values = { starts: "2026-03-01", ends: "2026-03-02", reason: "" }

describe("room closure form", () => {
  it("requires real dates and a range of one to sixty calendar nights", () => {
    for (const value of [
      { ...values, starts: "" },
      { ...values, ends: "" },
      { ...values, starts: "2026-02-30" },
      { ...values, ends: values.starts },
      { ...values, ends: "2026-02-28" },
      { ...values, ends: "2026-05-01" },
    ])
      assert.equal(roomClosureFormSchema.safeParse(value).success, false)
    assert.equal(roomClosureFormSchema.safeParse(values).success, true)
    assert.equal(
      roomClosureFormSchema.safeParse({ ...values, ends: "2026-04-30" })
        .success,
      true
    )
    assert.equal(closureNights("2026-03-01", "2026-04-30"), 60)
    const result = roomClosureFormSchema.safeParse({
      ...values,
      ends: values.starts,
    })
    assert.equal(result.success, false)
    if (!result.success) assert.deepEqual(result.error.issues[0].path, ["ends"])
  })

  it("normalizes the optional reason and detects edits including clearing it", () => {
    const saved = { ...values, reason: "Mantenimiento" }
    assert.equal(
      closureUnchanged(saved, { ...saved, reason: " Mantenimiento " }),
      true
    )
    assert.equal(closureUnchanged(saved, values), false)
    assert.equal(closureUnchanged({ ...values, reason: null }, values), true)
    assert.deepEqual(closurePayload({ ...values, reason: "  " }), {
      starts: values.starts,
      ends: values.ends,
      reason: undefined,
    })
    assert.equal(
      roomClosureFormSchema.safeParse({ ...values, reason: "x".repeat(81) })
        .success,
      false
    )
  })

  it("shows range conflicts on the reopening field and clears them before retry", () => {
    const form = new FormApi({
      defaultValues: values,
      validators: { onSubmit: roomClosureFormSchema },
    })
    const unmount = form.mount()
    const field = new FieldApi({ form, name: "ends" })
    const unmountField = field.mount()
    try {
      for (const code of [
        "room has a stay on those dates",
        "room is already closed on those dates",
        "no availability",
      ]) {
        const error = new ApiError(409, code)
        setServerErrors(form, closureFieldErrors(error)!)
        assert.equal(field.state.meta.isValid, false)
        assert.deepEqual(field.state.meta.errors, [error.message])
        form.setErrorMap({ onServer: undefined })
        form.setFieldMeta("ends", (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onServer: undefined },
        }))
        assert.equal(field.state.meta.isValid, true)
      }
      assert.deepEqual(
        closureFieldErrors(
          new ApiError(400, "stay cannot be longer than 60 nights")
        ),
        { ends: "El cierre no puede superar las 60 noches." }
      )
      assert.equal(
        closureFieldErrors(new ApiError(404, "room closure not found")),
        null
      )
      assert.equal(closureFieldErrors(new Error("offline")), null)
    } finally {
      unmountField()
      unmount()
    }
  })
})
