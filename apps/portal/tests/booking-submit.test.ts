import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

import type {
  CreateReservationInput,
  ReservationDetail,
} from "../src/lib/api.ts"
import {
  createBooking,
  type BookingRoomRequest,
  type CreatedBooking,
} from "../src/lib/create-booking.ts"
import {
  contactErrors,
  focusFirstError,
  partyCounts,
} from "../src/lib/form-validation.ts"

const guest = { firstName: "Ana", lastName: "Pérez" }
const room: BookingRoomRequest = {
  key: "draft-a",
  roomTypeId: "double",
  adults: 1,
  children: 0,
  discountCents: 0,
  roomId: "101",
}
const input: CreateReservationInput = {
  guest,
  checkIn: "2026-10-10",
  checkOut: "2026-10-11",
  rooms: [{ roomTypeId: "double", adults: 1, children: 0, discountCents: 0 }],
}

function reservation(lineIds: string[]): ReservationDetail {
  return {
    id: "reservation-1",
    code: "ABC123",
    guestId: "guest-1",
    guest: { id: "guest-1", ...guest, email: null, phone: null, notes: null },
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    currency: "PEN",
    subtotalCents: lineIds.length * 10000,
    totalCents: lineIds.length * 10000,
    discountCents: 0,
    paidCents: 0,
    balanceCents: lineIds.length * 10000,
    payments: [],
    rooms: lineIds.map((id) => ({
      id,
      roomTypeId: "double",
      roomTypeName: "Doble",
      roomId: null,
      roomNumber: null,
      adults: 1,
      children: 0,
      status: "confirmed",
      subtotalCents: 10000,
      discountCents: 0,
      totalCents: 10000,
      nights: [{ date: input.checkIn, priceCents: 10000 }],
    })),
  }
}

function assigned(detail: ReservationDetail, lineId: string, roomId: string) {
  return {
    ...detail,
    rooms: detail.rooms.map((line) =>
      line.id === lineId ? { ...line, roomId, roomNumber: roomId } : line
    ),
  }
}

describe("reservation field validation", () => {
  it("rejects whitespace-only names and permits an omitted or trimmed email", () => {
    const errors = contactErrors("  ", "\t", "  ")
    assert.ok(errors.firstName)
    assert.ok(errors.lastName)
    assert.equal(errors.email, null)
    assert.equal(
      contactErrors(" Ana ", " Pérez ", " ana@example.com ").email,
      null
    )
    assert.ok(contactErrors("Ana", "Pérez", "ana@").email)
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

describe("reservation creation and assignment recovery", () => {
  it("retries a cell assignment on the existing reservation", async () => {
    const created = reservation(["line-a"])
    const create = mock.fn(async () => created)
    let progress: CreatedBooking | null = null
    const onProgress = (saved: CreatedBooking) => {
      progress = saved
    }
    await assert.rejects(
      createBooking({
        input,
        rooms: [room],
        saved: null,
        create,
        assign: async () => {
          throw new Error("room taken")
        },
        onProgress,
      }),
      /room taken/
    )
    assert.equal(progress!.reservation.id, created.id)
    const assign = mock.fn(
      async ({ lineId, roomId }: { lineId: string; roomId: string }) =>
        assigned(created, lineId, roomId)
    )
    const result = await createBooking({
      input,
      rooms: [room],
      saved: progress,
      create,
      assign,
      onProgress,
    })
    assert.equal(create.mock.callCount(), 1)
    assert.equal(assign.mock.calls[0]!.arguments[0].lineId, "line-a")
    assert.equal(result.rooms[0]!.roomId, "101")
  })

  it("resumes a multi-room booking without duplicating identical lines or successful assignments", async () => {
    let detail = reservation(["line-b", "line-a"])
    let progress: CreatedBooking | null = null
    const rooms = [room, { ...room, key: "draft-b", roomId: "102" }]
    const create = mock.fn(async () => detail)
    const attempts: string[] = []
    let failSecond = true
    const assign = async ({
      lineId,
      roomId,
    }: {
      lineId: string
      roomId: string
    }) => {
      attempts.push(`${lineId}:${roomId}`)
      if (roomId === "102" && failSecond) throw new Error("room closed")
      detail = assigned(detail, lineId, roomId)
      return detail
    }
    const onProgress = (saved: CreatedBooking) => {
      progress = saved
    }
    await assert.rejects(
      createBooking({ input, rooms, saved: null, create, assign, onProgress }),
      /room closed/
    )
    assert.equal(progress!.reservation.rooms[0]!.roomId, "101")
    assert.equal(new Set(Object.values(progress!.lineIds)).size, 2)
    failSecond = false
    await createBooking({
      input,
      rooms,
      saved: progress,
      create,
      assign,
      onProgress,
    })
    assert.equal(create.mock.callCount(), 1)
    assert.deepEqual(attempts, ["line-b:101", "line-a:102", "line-a:102"])
    assert.deepEqual(
      detail.rooms.map((line) => line.roomId),
      ["101", "102"]
    )
  })

  it("allows changing the failed room or leaving it unassigned on recovery", async () => {
    const detail = reservation(["line-a"])
    const saved = { reservation: detail, lineIds: { "draft-a": "line-a" } }
    const create = mock.fn(async () => detail)
    const assign = mock.fn(
      async ({ lineId, roomId }: { lineId: string; roomId: string }) =>
        assigned(detail, lineId, roomId)
    )
    const moved = await createBooking({
      input,
      rooms: [{ ...room, roomId: "103" }],
      saved,
      create,
      assign,
      onProgress: () => {},
    })
    assert.equal(moved.rooms[0]!.roomId, "103")
    const unassigned = await createBooking({
      input,
      rooms: [{ ...room, roomId: null }],
      saved,
      create,
      assign,
      onProgress: () => {},
    })
    assert.equal(unassigned.rooms[0]!.roomId, null)
    assert.equal(assign.mock.callCount(), 1)
    assert.equal(create.mock.callCount(), 0)
  })

  it("preserves a created reservation even if a returned line cannot be matched", async () => {
    const detail = reservation([])
    const create = mock.fn(async () => detail)
    let progress: CreatedBooking | null = null
    const onProgress = (saved: CreatedBooking) => {
      progress = saved
    }
    const assign = mock.fn(async () => detail)
    await assert.rejects(
      createBooking({
        input,
        rooms: [room],
        saved: null,
        create,
        assign,
        onProgress,
      })
    )
    assert.equal(progress!.reservation.id, detail.id)
    await assert.rejects(
      createBooking({
        input,
        rooms: [room],
        saved: progress,
        create,
        assign,
        onProgress,
      })
    )
    assert.equal(create.mock.callCount(), 1)
    assert.equal(assign.mock.callCount(), 0)
  })

  it("does not attempt assignment or report progress when creation fails", async () => {
    const assign = mock.fn(async () => reservation(["line-a"]))
    const onProgress = mock.fn()
    await assert.rejects(
      createBooking({
        input,
        rooms: [room],
        saved: null,
        create: async () => {
          throw new Error("no availability")
        },
        assign,
        onProgress,
      }),
      /no availability/
    )
    assert.equal(assign.mock.callCount(), 0)
    assert.equal(onProgress.mock.callCount(), 0)
  })
})
