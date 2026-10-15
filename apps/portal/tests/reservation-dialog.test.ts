import assert from "node:assert/strict"
import { after, afterEach, before, beforeEach, it } from "node:test"
import { Window } from "happy-dom"
import { createServer, type ViteDevServer } from "vite"
import type { Root } from "react-dom/client"
import type { QueryClient as Client } from "@tanstack/react-query"
import type {
  ReservationDetail,
  StayingGuest,
  WorkflowCommand,
  WorkflowBilling,
  WorkflowIssue,
} from "../src/lib/api.ts"

let window: Window
let server: ViteDevServer
let React: typeof import("react")
let createRoot: (typeof import("react-dom/client"))["createRoot"]
let query: typeof import("@tanstack/react-query")
let forms: typeof import("../src/components/reservation-entry-forms.tsx")
let dialogs: typeof import("../src/components/room-booking-dialog.tsx")
let root: Root
let container: HTMLDivElement
let client: Client
const originalFetch = globalThis.fetch

before(async () => {
  window = new Window({ url: "http://localhost:5173" })
  for (const name of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "Element",
    "SVGElement",
    "HTMLButtonElement",
    "HTMLSelectElement",
    "Node",
    "NodeFilter",
    "Text",
    "Document",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "PointerEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ]) {
    const value = name === "window" ? window : Reflect.get(window, name)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value:
        typeof value === "function" && /^[a-z]/.test(name)
          ? value.bind(window)
          : value,
    })
  }
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  React = await import("react")
  ;({ createRoot } = await import("react-dom/client"))
  query = await import("@tanstack/react-query")
  // Compile the actual TSX components with the project's aliases and env.
  // Middleware mode with HMR disabled needs no listening HTTP server.
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    mode: "development",
  })
  forms = await server.ssrLoadModule(
    "/src/components/reservation-entry-forms.tsx"
  )
  dialogs = await server.ssrLoadModule(
    "/src/components/room-booking-dialog.tsx"
  )
})

after(async () => {
  globalThis.fetch = originalFetch
  await server?.close()
  await window?.happyDOM.close()
})

beforeEach(() => {
  container = window.document.createElement("div") as unknown as HTMLDivElement
  window.document.body.append(container)
  root = createRoot(container)
  client = new query.QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  })
})

afterEach(async () => {
  await React.act(async () => root.unmount())
  client.clear()
  container.remove()
  globalThis.fetch = originalFetch
})

function detail(): ReservationDetail {
  return {
    id: "reservation-1",
    code: "TEST0001",
    status: "confirmed",
    notes: null,
    cancellationReason: null,
    cancelledAt: null,
    savedDiscountCents: 0,
    creditCents: 0,
    guestId: "contact-1",
    guest: {
      id: "contact-1",
      fullName: "Test Guest",
      phone: null,
      email: null,
    },
    stayingGuests: [],
    checkIn: "2026-10-14",
    checkOut: "2026-10-16",
    source: "direct",
    currency: "PEN",
    totalCents: 30000,
    subtotalCents: 30000,
    discountCents: 0,
    paidCents: 0,
    balanceCents: 30000,
    payments: [],
    rooms: [
      {
        id: "line-1",
        roomTypeId: "double",
        roomTypeName: "Doble",
        roomId: "room-1",
        roomNumber: "101",
        adults: 1,
        children: 0,
        subtotalCents: 30000,
        discountCents: 0,
        totalCents: 30000,
        nights: [],
      },
    ],
  } as ReservationDetail
}

async function render(element: React.ReactNode) {
  await React.act(async () => {
    root.render(withClient(element))
  })
}

function withClient(element: React.ReactNode) {
  return React.createElement(query.QueryClientProvider, { client }, element)
}

async function flush(ms = 0) {
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

async function until(condition: () => boolean, message: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return
    await flush(10)
  }
  assert.ok(condition(), message)
}

function control(name: string) {
  const input = window.document.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(`[name="${name}"]`)
  assert.ok(input, `Missing field ${name}`)
  return input
}

async function fill(name: string, value: string) {
  const input = control(name)
  const prototype =
    input.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(
      new window.Event("input", { bubbles: true }) as unknown as Event
    )
  })
}

async function submit() {
  const form = container.querySelector("form")!
  await React.act(async () => {
    form.dispatchEvent(
      new window.Event("submit", {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    )
  })
}

function button(label: string) {
  const element = Array.from(window.document.querySelectorAll("button")).find(
    (button) => button.textContent.trim() === label
  )
  assert.ok(element, `Missing button ${label}`)
  return element
}

it("adds consecutive guests with distinct IDs and resets the real form across rerenders", async () => {
  let saved = detail()
  const writes: StayingGuest[][] = []
  const props = () => ({
    detail: saved,
    disabled: false,
    onDirtyChange: () => {},
    onSave: async (guests: StayingGuest[]) => {
      writes.push(guests)
      saved = { ...saved, stayingGuests: guests }
      root.render(
        withClient(React.createElement(forms.GuestEntryForm, props()))
      )
    },
  })
  await render(React.createElement(forms.GuestEntryForm, props()))
  for (const name of ["First Guest", "Second Guest"]) {
    await fill("fullName", name)
    await submit()
    assert.equal(control("fullName").value, "")
  }
  assert.equal(writes.length, 2)
  assert.deepEqual(
    saved.stayingGuests.map((guest) => guest.fullName),
    ["First Guest", "Second Guest"]
  )
  assert.notEqual(saved.stayingGuests[0].id, saved.stayingGuests[1].id)
})

it("clears each successful payment without restoring the original suggested balance", async () => {
  let saved = detail()
  const amounts: number[] = []
  const props = () => ({
    detail: saved,
    disabled: false,
    onDirtyChange: () => {},
    onReady: async (_title: string, actions: WorkflowCommand["actions"]) => {
      const action = actions[0]
      assert.equal(action.type, "add-payment")
      if (action.type !== "add-payment") return
      amounts.push(action.payment.amountCents)
      saved = {
        ...saved,
        balanceCents: saved.balanceCents - action.payment.amountCents,
      }
      root.render(withClient(React.createElement(forms.PaymentForm, props())))
    },
  })
  await render(React.createElement(forms.PaymentForm, props()))
  assert.equal(control("amount").value, "300.00")
  for (const amount of ["100", "50"]) {
    await fill("amount", amount)
    await submit()
    assert.equal(control("amount").value, "")
    await flush()
    assert.equal(control("amount").value, "")
  }
  assert.deepEqual(amounts, [10000, 5000])
})

it("refreshes an untouched payment suggestion and preserves a manually entered amount", async () => {
  const props = {
    disabled: false,
    onDirtyChange: () => {},
    onReady: async () => {},
  }
  await render(
    React.createElement(forms.PaymentForm, { ...props, detail: detail() })
  )
  await render(
    React.createElement(forms.PaymentForm, {
      ...props,
      detail: { ...detail(), balanceCents: 25000 },
    })
  )
  assert.equal(control("amount").value, "250.00")
  await fill("amount", "75")
  await render(
    React.createElement(forms.PaymentForm, {
      ...props,
      detail: { ...detail(), balanceCents: 20000 },
    })
  )
  assert.equal(control("amount").value, "75")
})

function mockApi(
  handler: (path: string, command: WorkflowCommand) => Promise<Response>
) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (init?.method === "POST")
      return handler(url.pathname, JSON.parse(String(init.body)))
    if (url.pathname === "/room-types")
      return Response.json([{ id: "double", name: "Doble", maxOccupancy: 2 }])
    if (url.pathname === "/rooms")
      return Response.json([
        { id: "room-1", number: "101", roomTypeId: "double" },
      ])
    if (url.pathname === "/reservations/reservation-1")
      return Response.json(detail())
    if (url.pathname === "/reservations" || url.pathname === "/room-closures")
      return Response.json([])
    throw new Error(`Unexpected request ${url.pathname}`)
  }
}

function previewResponse(
  billing: WorkflowBilling,
  issues: WorkflowIssue[] = []
) {
  return Response.json({ billing, validation: { issues } })
}

function fieldTrigger(label: string, index = 0) {
  const fieldLabel = Array.from(
    window.document.querySelectorAll("label")
  ).filter((item) => item.textContent.trim() === label)[index]
  assert.ok(fieldLabel, `Missing label ${label}`)
  return window.document.getElementById(
    fieldLabel.htmlFor
  ) as unknown as HTMLButtonElement
}

async function choose(label: string, option: string, index = 0) {
  const trigger = fieldTrigger(label, index)
  await until(() => !trigger.hasAttribute("disabled"), `${label} must be ready`)
  await React.act(async () => trigger.click())
  const item = Array.from(
    window.document.querySelectorAll('[role="option"]')
  ).find((item) => item.textContent.trim() === option)
  assert.ok(item, `Missing option ${option}`)
  assert.notEqual(item.getAttribute("aria-disabled"), "true")
  await React.act(async () => (item as unknown as HTMLElement).click())
}

it("keeps an extension price visible and identifies the conflicting room without exposing its ID", async () => {
  const initial = detail()
  let writes = 0
  const previews: WorkflowCommand[] = []
  let finishPreview!: () => void
  mockApi(async (path, command) => {
    if (path.endsWith("/commands")) {
      writes++
      return Response.json(initial)
    }
    previews.push(command)
    const assignment = command.actions.find(
      (action) => action.type === "edit-room"
    )
    const conflict =
      !assignment ||
      assignment.type !== "edit-room" ||
      assignment.room.roomId !== null
    const response = previewResponse(
      {
        ...initial,
        checkOut: "2026-10-17",
        subtotalCents: 45000,
        totalCents: 45000,
        balanceCents: 45000,
        rooms: [
          { ...initial.rooms[0], subtotalCents: 45000, totalCents: 45000 },
        ],
      },
      conflict
        ? [
            {
              code: "room is already assigned for those dates",
              roomIndex: 0,
              field: "roomId",
            },
          ]
        : []
    )
    return previews.length === 2
      ? new Promise<Response>((resolve) => {
          finishPreview = () => resolve(response)
        })
      : response
  })
  const fetchApi = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    if (!init?.method && new URL(String(input)).pathname === "/reservations")
      return Response.json([
        {
          id: "next-reservation",
          status: "confirmed",
          checkIn: "2026-10-16",
          checkOut: "2026-10-18",
          rooms: [{ id: "next-line", roomTypeId: "double", roomId: "room-1" }],
        },
      ])
    return fetchApi(input, init)
  }
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: initial,
      onRefresh: () => {},
    })
  )
  await React.act(async () => fieldTrigger("Check-out").click())
  const day = Array.from(
    window.document.querySelectorAll<HTMLButtonElement>("button[data-day]")
  ).find((button) => button.textContent.trim() === "17")
  assert.ok(day)
  await React.act(async () => day.click())
  const room = fieldTrigger("Hab.")
  await until(
    () => room.getAttribute("aria-invalid") === "true",
    "Conflict must mark the assigned room"
  )
  assert.equal(
    room.querySelector('[data-slot="select-value"]')?.textContent.trim(),
    "101"
  )
  assert.equal(button("Guardar detalles").disabled, true)
  const error = window.document.getElementById(
    room.getAttribute("aria-describedby")!
  )!
  assert.ok(error.textContent.includes("ocupada para esas fechas"))
  assert.equal(container.querySelector("aside")!.contains(error), false)
  const subtotal = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === "Importe habitaciones"
  )!
  assert.equal(
    subtotal.nextElementSibling?.textContent.replace(/\s/g, ""),
    "S/450"
  )
  assert.ok(container.textContent.includes("Vista previa"))
  assert.equal(container.textContent.includes("Reintentar"), false)
  assert.equal(container.textContent.includes("Calculando…"), false)
  await submit()
  assert.equal(writes, 0)
  await React.act(async () => room.click())
  const options = Array.from(
    window.document.querySelectorAll<HTMLElement>('[role="option"]')
  )
  assert.equal(
    options
      .find((item) => item.textContent.trim() === "101")
      ?.getAttribute("aria-disabled"),
    "true"
  )
  const unassigned = options.find(
    (item) => item.textContent.trim() === "Sin asignar"
  )!
  await React.act(async () => unassigned.click())
  const assertQuoteVisible = () => {
    assert.equal(
      subtotal.nextElementSibling?.textContent.replace(/\s/g, ""),
      "S/450"
    )
    assert.equal(container.textContent.includes("Calculando…"), false)
    assert.equal(button("Guardar detalles").disabled, true)
  }
  assertQuoteVisible()
  await flush(150)
  assertQuoteVisible()
  await until(() => previews.length === 2, "Assignment must be revalidated")
  assertQuoteVisible()
  await React.act(async () => finishPreview())
  await until(
    () => !button("Guardar detalles").disabled,
    "Clearing the assignment must resolve the conflict"
  )
  assert.equal(room.getAttribute("aria-invalid"), "false")
  assert.equal(
    window.document.body.textContent.includes("ocupada para esas fechas"),
    false
  )
  assert.equal(
    subtotal.nextElementSibling?.textContent.replace(/\s/g, ""),
    "S/450"
  )
  assert.equal(previews.length, 2)
})

it("keeps pricing an added room when its occupancy is invalid and blocks saving", async () => {
  const previews: WorkflowCommand[] = []
  mockApi(async (path, command) => {
    assert.ok(path.endsWith("/preview"))
    previews.push(command)
    const added = command.actions.find((action) => action.type === "add-room")!
    assert.equal(added.type, "add-room")
    if (added.type !== "add-room") throw new Error("Expected added room")
    return previewResponse(
      {
        ...detail(),
        subtotalCents: 60000,
        totalCents: 60000,
        balanceCents: 60000,
        rooms: [
          ...detail().rooms,
          { ...detail().rooms[0], id: "new-line", roomId: null, ...added.room },
        ],
      },
      added.room.adults > 2
        ? [
            {
              code: "too many guests for this room type",
              roomIndex: 1,
              field: "occupancy",
            },
          ]
        : []
    )
  })
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    })
  )
  await React.act(async () => button("Agregar habitación").click())
  await until(
    () => !button("Guardar detalles").disabled,
    "Added room must be priced"
  )
  await fill("rooms[1].room.adults", "3")
  await until(
    () =>
      previews.length === 2 && !container.textContent.includes("Calculando…"),
    "Invalid occupancy must still receive a price"
  )
  const subtotal = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === "Importe habitaciones"
  )!
  assert.equal(
    subtotal.nextElementSibling?.textContent.replace(/\s/g, ""),
    "S/600"
  )
  assert.ok(container.textContent.includes("La habitación no tiene capacidad"))
  assert.equal(button("Guardar detalles").disabled, true)
  await fill("rooms[1].room.adults", "2")
  await until(
    () => !button("Guardar detalles").disabled,
    "Corrected occupancy must allow saving"
  )
  assert.equal(
    container.textContent.includes("La habitación no tiene capacidad"),
    false
  )
})

it("allows choosing and saving check-in with an unassigned room", async () => {
  const initial = detail()
  initial.rooms[0].roomId = null
  initial.rooms[0].roomNumber = null
  const writes: WorkflowCommand[] = []
  mockApi(async (path, command) => {
    if (path.endsWith("/commands")) writes.push(command)
    const saved = { ...initial, status: "checked_in" }
    return path.endsWith("/preview")
      ? previewResponse(saved)
      : Response.json(saved)
  })
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: initial,
      onRefresh: () => {},
    })
  )
  await choose("Estado de la reserva", "Check-in")
  await until(
    () => !button("Guardar detalles").disabled,
    "Check-in must be savable"
  )
  await submit()
  await until(() => writes.length === 1, "Check-in must save")
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "checked_in" },
  ])
  assert.equal(
    window.document.body.textContent.includes("antes del check-in"),
    false
  )
})

it("previews and saves added unassigned rooms after check-in and allows clearing assignments", async () => {
  const initial = { ...detail(), status: "checked_in" }
  const writes: WorkflowCommand[] = []
  const previews: WorkflowCommand[] = []
  mockApi(async (path, command) => {
    if (path.endsWith("/commands")) writes.push(command)
    else previews.push(command)
    const hasAdded = command.actions.some(
      (action) => action.type === "add-room"
    )
    const unassigned = { ...initial.rooms[0], roomId: null, roomNumber: null }
    const saved = {
      ...initial,
      rooms: hasAdded
        ? [unassigned, { ...unassigned, id: "line-2" }]
        : [unassigned],
      subtotalCents: hasAdded ? 60000 : 30000,
      totalCents: hasAdded ? 60000 : 30000,
      balanceCents: hasAdded ? 60000 : 30000,
    }
    return path.endsWith("/preview")
      ? previewResponse(saved)
      : Response.json(saved)
  })
  // Match the dialog's subscription to the saved reservation cache.
  client.setQueryData(["reservation", initial.id], initial)
  function Editor() {
    const reservation = query.useQuery<ReservationDetail>({
      queryKey: ["reservation", initial.id],
      queryFn: async () => initial,
      staleTime: Infinity,
    })
    return React.createElement(dialogs.BookingEditor, {
      detail: reservation.data!,
      onRefresh: () => {},
    })
  }
  await render(React.createElement(Editor))
  await choose("Hab.", "Sin asignar")
  await React.act(async () => button("Agregar habitación").click())
  await until(
    () => !button("Guardar detalles").disabled,
    "Added room must have a valid preview"
  )
  assert.ok(
    previews.some((command) =>
      command.actions.some((action) => action.type === "add-room")
    )
  )
  const subtotal = Array.from(window.document.querySelectorAll("dt")).find(
    (item) => item.textContent === "Importe habitaciones"
  )!
  assert.equal(
    subtotal.nextElementSibling?.textContent.replace(/\s/g, ""),
    "S/600"
  )
  assert.ok(window.document.body.textContent.includes("Vista previa"))
  await submit()
  await until(
    () => writes.length === 1,
    "Unassigned rooms must save after check-in"
  )
  assert.ok(
    writes[0].actions.some(
      (action) => action.type === "edit-room" && action.room.roomId === null
    )
  )
  assert.ok(
    writes[0].actions.some(
      (action) => action.type === "add-room" && action.room.roomId === null
    )
  )
  await until(
    () => button("Guardar detalles").disabled,
    "Successful save must reset changes"
  )
  assert.equal(
    window.document.body.textContent.includes("antes del check-in"),
    false
  )
})

it("retries a failed validation preview without losing edits and re-enables saving", async () => {
  const previews: WorkflowCommand[] = []
  mockApi(async (path, command) => {
    assert.equal(path, "/reservations/reservation-1/preview")
    previews.push(command)
    return previews.length === 1
      ? Response.json({ error: "Temporary preview failure" }, { status: 503 })
      : previewResponse(detail())
  })
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    })
  )
  await flush()
  await fill("rooms[0].room.adults", "2")
  await until(
    () =>
      window.document.body.textContent.includes("Temporary preview failure"),
    "Preview failure must appear"
  )
  assert.equal(button("Guardar detalles").disabled, true)
  await React.act(async () => button("Reintentar").click())
  await until(
    () => !button("Guardar detalles").disabled,
    "Successful retry must permit saving"
  )
  assert.equal(control("rooms[0].room.adults").value, "2")
  assert.equal(previews.length, 2)
  assert.deepEqual(previews[0], previews[1])
})

for (const succeeds of [true, false]) {
  it(`blocks closing during a save and unlocks after ${succeeds ? "success" : "failure"}`, async () => {
    let finish!: (response: Response) => void
    let requests = 0
    let closed = 0
    let viewed = 0
    try {
      mockApi(async (path) => {
        assert.equal(path, "/reservations/reservation-1/commands")
        requests++
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      })
      await render(
        React.createElement(dialogs.RoomBookingDialog, {
          target: {
            mode: "edit",
            reservationId: "reservation-1",
            roomId: "room-1",
            number: "101",
            typeName: "Doble",
          },
          timeZone: "UTC",
          onClose: () => {
            closed++
          },
          onViewReservation: () => {
            viewed++
          },
        })
      )
      await until(
        () =>
          !!container.querySelector('[name="notes"]') ||
          !!window.document.querySelector('[name="notes"]'),
        "Reservation must load"
      )
      // Dialog content renders through a portal.
      const popup = window.document.querySelector('[role="dialog"]')!
      const input = popup.querySelector<HTMLTextAreaElement>('[name="notes"]')!
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )!.set!.call(input, "Saved note")
        input.dispatchEvent(
          new window.Event("input", { bubbles: true }) as unknown as Event
        )
      })
      await React.act(async () =>
        popup
          .querySelector("form")!
          .dispatchEvent(
            new window.Event("submit", { bubbles: true, cancelable: true })
          )
      )
      await until(() => requests === 1, "Save must begin")
      await until(
        () => button("Cerrar").disabled,
        "Pending save must disable closing"
      )
      await React.act(async () => {
        popup.dispatchEvent(
          new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
        const link = popup.querySelector<HTMLButtonElement>(
          '[aria-label="Ver reserva completa"]'
        )!
        link.click()
      })
      assert.equal(closed, 0)
      assert.equal(viewed, 0)
      assert.equal(
        window.document.body.textContent.includes("Descartar y salir"),
        false
      )
      await React.act(async () =>
        finish(
          succeeds
            ? Response.json({ ...detail(), notes: "Saved note" })
            : Response.json(
                { error: "Temporary save failure" },
                { status: 503 }
              )
        )
      )
      await until(
        () => !button("Cerrar").disabled,
        "Completed save must unlock closing"
      )
      await React.act(async () => button("Cerrar").click())
      if (!succeeds) {
        assert.equal(closed, 0)
        await React.act(async () => button("Descartar y salir").click())
      }
      assert.equal(closed, 1)
    } finally {
      if (finish) await React.act(async () => finish(Response.json(detail())))
    }
  })
}

it("retries a failed cancellation preview without reopening the confirmation", async () => {
  let requests = 0
  mockApi(async (path) => {
    assert.equal(path, "/reservations/reservation-1/preview")
    return ++requests === 1
      ? Response.json(
          { error: "Temporary cancellation failure" },
          { status: 503 }
        )
      : previewResponse({
          ...detail(),
          status: "cancelled",
          totalCents: 0,
          balanceCents: 0,
        })
  })
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    })
  )
  await React.act(async () => button("Cancelar reserva").click())
  await until(
    () =>
      window.document.body.textContent.includes(
        "Temporary cancellation failure"
      ),
    "Cancellation preview error must appear"
  )
  assert.equal(button("Confirmar").disabled, true)
  await React.act(async () => button("Reintentar").click())
  await until(
    () => !button("Confirmar").disabled,
    "Successful cancellation preview retry must permit confirming"
  )
  assert.equal(requests, 2)
})

it("preserves a failed payment draft and clears it only after a successful retry", async () => {
  let calls = 0
  await render(
    React.createElement(forms.PaymentForm, {
      detail: detail(),
      disabled: false,
      onDirtyChange: () => {},
      onReady: async () => {
        if (++calls === 1) throw new Error("Temporary payment failure")
      },
    })
  )
  await fill("amount", "75")
  await submit()
  await flush()
  assert.equal(control("amount").value, "75")
  await submit()
  await flush()
  assert.equal(control("amount").value, "")
  assert.equal(calls, 2)
})

it("keeps the cancellation bill stable while typing and saves the latest reason with safe retries", async () => {
  const previews: WorkflowCommand[] = []
  const writes: WorkflowCommand[] = []
  mockApi(async (path, command) => {
    if (path.endsWith("/preview")) {
      previews.push(command)
      return previewResponse({
        ...detail(),
        status: "cancelled",
        totalCents: 0,
        balanceCents: 0,
      })
    }
    assert.equal(path, "/reservations/reservation-1/commands")
    writes.push(command)
    return writes.length === 1
      ? Response.json(
          { error: "Temporary cancellation save failure" },
          { status: 503 }
        )
      : Response.json({ ...detail(), status: "cancelled" })
  })
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    })
  )
  await React.act(async () => button("Cancelar reserva").click())
  await until(
    () => !button("Confirmar").disabled,
    "Cancellation preview must finish"
  )
  const confirmation = window.document.querySelector('[role="alertdialog"]')!
  const bill = confirmation.querySelector("dl")!
  assert.ok(bill)
  const reason = "  Cambio de planes  "
  for (let length = 1; length <= reason.length; length++) {
    await fill("reason", reason.slice(0, length))
    await flush()
    assert.equal(previews.length, 1)
    assert.equal(confirmation.querySelector("dl"), bill)
    assert.equal(button("Confirmar").disabled, false)
    assert.equal(confirmation.textContent.includes("Calculando…"), false)
  }
  await React.act(async () => button("Confirmar").click())
  await until(
    () => writes.length === 1 && !button("Confirmar").disabled,
    "Failed cancellation save must allow retrying"
  )
  assert.equal(control("reason").value, reason)
  await React.act(async () => button("Confirmar").click())
  await until(
    () => !window.document.querySelector('[role="alertdialog"]'),
    "Successful cancellation must close the confirmation"
  )
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[0], writes[1])
  assert.deepEqual(writes[1].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ])
  assert.equal(previews.length, 1)
  assert.deepEqual(previews[0].actions, [
    { type: "set-status", status: "cancelled" },
  ])
})
