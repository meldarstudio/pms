import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import {
  contactErrors,
  focusFirstError,
  partyCounts,
} from "../src/lib/form-validation.ts"

describe("reservation field validation", () => {
  it("rejects whitespace-only names and permits an omitted or trimmed email", () => {
    const errors = contactErrors("  ", "  ")
    assert.ok(errors.fullName)
    assert.equal(errors.email, null)
    assert.equal(contactErrors(" Ana Pérez ", " ana@example.com ").email, null)
    assert.ok(contactErrors("Ana Pérez", "ana@").email)
  })

  it("does not silently treat an empty child count as zero", () => {
    for (const value of ["", " ", "-1", "1.5", "NaN", "Infinity"]) {
      assert.equal(partyCounts("1", value).valid, false, value)
      assert.ok(partyCounts("1", value).childrenError)
    }
    assert.equal(partyCounts("1", "0").valid, true)
    assert.equal(partyCounts("0", "0").valid, false)
    assert.equal(partyCounts("1.5", "0").valid, false)
    assert.equal(partyCounts("", "0").valid, false)
  })

  it("focuses the first editable error in form order after messages mount", (t) => {
    let render: FrameRequestCallback | undefined
    const previous = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      render = callback
      return 1
    }
    t.after(() => {
      if (previous) globalThis.requestAnimationFrame = previous
      else Reflect.deleteProperty(globalThis, "requestAnimationFrame")
    })
    const controls = ["locked-date", "room-stable-id", "guest-name"].map(
      (id, index) => ({
        id,
        matches: () => index === 0,
        focus: mock.fn(),
        scrollIntoView: mock.fn(),
      })
    )
    const form = {
      isConnected: true,
      querySelectorAll: () => controls,
    } as unknown as HTMLFormElement
    focusFirstError(form, {
      "guest-name": "Ingresa los nombres.",
      "locked-date": "Fechas inválidas.",
      "room-stable-id": "Selecciona un tipo.",
    })
    assert.equal(controls[1]!.focus.mock.callCount(), 0)
    render!(0)
    assert.equal(controls[0]!.focus.mock.callCount(), 0)
    assert.equal(controls[1]!.focus.mock.callCount(), 1)
    assert.equal(controls[1]!.scrollIntoView.mock.callCount(), 1)
    assert.equal(controls[2]!.focus.mock.callCount(), 0)
  })
})
