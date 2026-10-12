/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../index'
import type { presentReservation } from '../present'

type Detail = ReturnType<typeof presentReservation>

let sqlite: DatabaseSync
let binding: D1Database
let batchTail: Promise<unknown> = Promise.resolve()

// Run the actual Hono routes and Drizzle SQL against SQLite with D1-style batches.
function statement(sql: string, params: SQLInputValue[] = []) {
  return {
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    raw: async () => {
      // The subquery gives duplicate join columns distinct names on Node 22.
      return sqlite
        .prepare(`SELECT * FROM (${sql})`)
        .all(...params)
        .map((row) => Object.values(row))
    },
    run: async () => {
      sqlite.prepare(sql).run(...params)
      return { success: true, results: [] }
    },
    all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params) }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-10T15:00:00Z'))
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  const dir = new URL('../../drizzle/', import.meta.url)
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8')) as {
    entries: { tag: string }[]
  }
  for (const { tag } of journal.entries)
    sqlite.exec(readFileSync(new URL(`${tag}.sql`, dir), 'utf8'))
  sqlite.exec(`
    INSERT INTO room_types VALUES ('type', 'King', 2, 10000, '2026-10-10');
    INSERT INTO rooms VALUES ('room-101', '101', 'type'), ('room-102', '102', 'type'), ('room-103', '103', 'type');
  `)
  binding = {
    prepare: (sql: string) => statement(sql),
    batch: (queries: ReturnType<typeof statement>[]) => {
      const result = batchTail.then(async () => {
        sqlite.exec('BEGIN')
        try {
          const results = []
          for (const query of queries) results.push(await query.run())
          sqlite.exec('COMMIT')
          return results
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      })
      batchTail = result.catch(() => {})
      return result
    },
  } as unknown as D1Database
})

afterEach(() => {
  sqlite.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function request(path: string, method = 'GET', body?: unknown) {
  return app.request(
    path,
    {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    },
    { DB: binding, CURRENCY: 'PEN' },
  )
}

async function create(count = 1, dates = { checkIn: '2026-10-10', checkOut: '2026-10-13' }) {
  const response = await request('/reservations', 'POST', {
    requestId: crypto.randomUUID(),
    guest: { fullName: 'Ada Lovelace' },
    rooms: Array.from({ length: count }, () => ({
      roomTypeId: 'type',
      adults: 1,
      children: 0,
      ...dates,
    })),
  })
  expect(response.status).toBe(201)
  return response.json() as Promise<Detail>
}
import type { WorkflowAction } from '@pms/shared'
async function command(d: Detail, actions: WorkflowAction[], status = 200) {
  const r = await request(`/reservations/${d.id}/commands`, 'POST', {
    requestId: crypto.randomUUID(),
    version: d.version,
    actions,
  })
  const body = await r.json()
  expect(r.status, JSON.stringify(body)).toBe(status)
  return body as Detail
}
const roomEdit = (d: Detail, i = 0, patch: Record<string, unknown> = {}): WorkflowAction => ({
  type: 'edit-room',
  lineId: d.rooms[i].id,
  room: {
    roomTypeId: 'type',
    roomId: `room-${101 + i}`,
    adults: 1,
    children: 0,
    checkIn: d.rooms[i].checkIn,
    checkOut: d.rooms[i].checkOut,
    ...patch,
  },
})
const pay = (amountCents: number): WorkflowAction => ({
  type: 'financial',
  entry: { kind: 'payment', amountCents, method: 'cash', paymentDate: '2026-10-10' },
})
const setDiscount = (amountCents: number): WorkflowAction => ({ type: 'set-discount', amountCents })
const adjust = (kind: 'waiver' | 'refund', amountCents: number): WorkflowAction => ({
  type: 'financial',
  entry: { kind, amountCents, method: 'cash', reason: 'Acordado con el huésped' },
})
const all = (d: Detail, type: 'check-in' | 'check-out'): WorkflowAction => ({
  type,
  lineIds: d.rooms.map((l) => l.id),
})
async function arrive(d: Detail) {
  return command(d, [...d.rooms.map((_, i) => roomEdit(d, i)), all(d, 'check-in')])
}

describe('reservation workflow', () => {
  it('books unassigned capacity and preserves prices when assigning', async () => {
    let d = await create(2)
    expect(d.totalCents).toBe(60000)
    d = await command(d, [roomEdit(d)])
    expect(d.totalCents).toBe(60000)
    const availability = (await (
      await request('/availability?checkIn=2026-10-10&checkOut=2026-10-13')
    ).json()) as { roomTypes: { free: number }[] }
    expect(availability.roomTypes[0].free).toBe(1)
    d = await command(d, [roomEdit(d, 0, { roomId: null })])
    expect(d.rooms[0].roomId).toBeNull()
    await command(d, [all(d, 'check-in')], 400)
  })
  it('allows partial and final checkout with debt without changing dates or prices', async () => {
    let d = await arrive(await create(2))
    d = await command(d, [{ type: 'check-out', lineIds: [d.rooms[0].id] }])
    expect(d.rooms.map((l) => l.status)).toEqual(['checked_out', 'checked_in'])
    expect(d.balanceCents).toBe(60000)
    d = await command(d, [{ type: 'check-out', lineIds: [d.rooms[1].id] }])
    expect(d.balanceCents).toBe(60000)
    expect(d.rooms.every((l) => l.checkOut === '2026-10-13' && l.nights.length === 3)).toBe(true)
  })
  it('retains no-show room charges and shared payments', async () => {
    let d = await create(2)
    d = await command(d, [
      roomEdit(d),
      { type: 'check-in', lineIds: [d.rooms[0].id] },
      { type: 'no-show', lineId: d.rooms[1].id },
    ])
    d = await command(d, [pay(10000), { type: 'check-out', lineIds: [d.rooms[0].id] }])
    expect(d.totalCents).toBe(60000)
    expect(d.balanceCents).toBe(50000)
    expect(d.rooms[1].totalCents).toBe(30000)
  })
  it('previews and saves a deposit-only no-show fee through an ordinary discount', async () => {
    let d = await command(await create(), [pay(10000)])
    const actions: WorkflowAction[] = [
      { type: 'set-status', lineId: d.rooms[0].id, status: 'no_show' },
      setDiscount(20000),
    ]
    const preview = await request(`/reservations/${d.id}/preview`, 'POST', {
      requestId: crypto.randomUUID(), version: d.version, actions,
    })
    expect(preview.status).toBe(200)
    expect(await preview.json()).toMatchObject({
      subtotalCents: 30000, discountCents: 20000, totalCents: 10000,
      paidCents: 10000, balanceCents: 0,
    })
    d = await command(d, actions)
    expect(d).toMatchObject({ totalCents: 10000, paidCents: 10000, balanceCents: 0 })
    d = await command(d, [{ type: 'cancel', confirmed: true }])
    expect(d).toMatchObject({ totalCents: 0, discountCents: 0, balanceCents: -10000 })
    d = await command(d, [{ type: 'delete-financial', entryId: d.financialEntries.find((e) => e.kind === 'payment')!.id }])
    expect(d).toMatchObject({ totalCents: 0, paidCents: 0, balanceCents: 0 })
  })
  it('applies the discount in full after room cancellation and allows changing and clearing it', async () => {
    let d = await create(2)
    d = await command(d, [setDiscount(50000), pay(20000)])
    d = await command(d, [{ type: 'cancel-room', lineId: d.rooms[0].id }])
    expect(d.totalCents).toBe(-20000)
    expect(d.creditCents).toBe(40000)
    d = await command(d, [setDiscount(5000)])
    expect(d.balanceCents).toBe(5000)
    d = await command(d, [setDiscount(0)])
    expect(d.balanceCents).toBe(10000)
    expect(d.financialEntries.some((e) => e.kind === 'discount')).toBe(false)
  })
  it('rejects discounts as financial entries and negative discount amounts', async () => {
    const d = await create()
    await command(d, [{ type: 'financial', entry: { kind: 'discount', amountCents: 1000 } }], 400)
    await command(d, [{ type: 'set-discount', amountCents: -1 }], 400)
    await command(d, [{ type: 'set-discount', amountCents: 1.5 }], 400)
  })
  it('removes cancelled charges but retains payments as credit and in payment reports', async () => {
    let d = await arrive(await create())
    d = await command(d, [pay(30000), setDiscount(5000), all(d, 'check-out')])
    d = await command(d, [{ type: 'cancel', confirmed: true }])
    expect(d).toMatchObject({ totalCents: 0, paidCents: 30000, discountCents: 0, savedDiscountCents: 5000, creditCents: 30000, balanceCents: -30000 })
    expect(d.financialEntries[0].amountCents).toBe(30000)
    expect(d.rooms[0].nights).toHaveLength(3)
    const report = await (await request('/payments?from=2026-10-10&to=2026-10-10')).json()
    expect(report).toMatchObject({ totalCents: 30000, payments: [{ amountCents: 30000 }] })
  })
  it('rejects new refunds, waivers, and the old correction workflow', async () => {
    const d = await command(await create(), [pay(40000)])
    await command(d, [adjust('refund', 1000)], 400)
    await command(d, [adjust('waiver', 1000)], 400)
    await command(
      d,
      [{ type: 'correct-financial', entryId: d.financialEntries[0].id, reason: 'Error' }],
      400,
    )
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).creditCents).toBe(
      10000,
    )
  })
  it('keeps retained flat-rate nights and uses current rates only for added dates', async () => {
    let d = await create()
    sqlite.exec(
      'UPDATE reservation_room_nights SET price_cents=7000; UPDATE room_types SET base_rate_cents=12000',
    )
    d = await command(d, [roomEdit(d, 0, { checkOut: '2026-10-14' })])
    expect(d.rooms[0].nights.map((n) => n.priceCents)).toEqual([7000, 7000, 7000, 12000])
    await command(d, [roomEdit(d, 0, { checkOut: '2027-01-01' })], 400)
  })
  it('reprices type changes and permits an explicit matching assignment', async () => {
    sqlite.exec(
      "INSERT INTO room_types VALUES ('other','Twin',3,20000,'2026-10-10'); INSERT INTO rooms VALUES ('201','201','other')",
    )
    let d = await create()
    d = await command(d, [roomEdit(d)])
    d = await command(d, [roomEdit(d, 0, { roomTypeId: 'other', roomId: '201' })])
    expect(d.rooms[0].roomId).toBe('201')
    expect(d.totalCents).toBe(60000)
  })
  it('rejects closed and occupied assignments and rolls back all selected actions', async () => {
    let first = await create()
    first = await command(first, [roomEdit(first)])
    const d = await create()
    await command(d, [pay(10000), roomEdit(d)], 409)
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).paidCents).toBe(0)
    sqlite.exec(
      "INSERT INTO room_closures VALUES ('closed','room-102','2026-10-10','2026-10-13','Maintenance','2026-10-10')",
    )
    await command(d, [roomEdit(d, 0, { roomId: 'room-102' })], 409)
  })
  it('moves immediately within type, changes the final assignment and releases the old room', async () => {
    let d = await arrive(await create())
    vi.setSystemTime(new Date('2026-10-11T15:00:00Z'))
    d = await command(d, [{ type: 'move', lineId: d.rooms[0].id, roomId: 'room-102' }])
    expect(d.totalCents).toBe(30000)
    expect(d.rooms[0].assignmentStart).toBe('2026-10-10')
    const next = await create(1, { checkIn: '2026-10-11', checkOut: '2026-10-13' })
    await command(next, [roomEdit(next)])
  })
  it('requires reasoned individual mistaken arrival correction', async () => {
    let d = await arrive(await create(2))
    d = await command(d, [
      {
        type: 'undo-check-in',
        lineId: d.rooms[0].id,
        reason: 'Registro equivocado',
        guestsNotArrived: true,
      },
    ])
    expect(d.rooms.map((l) => l.status)).toEqual(['confirmed', 'checked_in'])
  })
  it('allows late status recording without using the recording time to change the bill', async () => {
    let d = await create(1, { checkIn: '2026-10-01', checkOut: '2026-10-04' })
    d = await arrive(d)
    d = await command(d, [all(d, 'check-out')])
    expect(d.totalCents).toBe(30000)
    expect(d.rooms[0].checkOut).toBe('2026-10-04')
  })
  it('edits a mistaken cash payment in place after checkout without reopening the stay', async () => {
    let d = await arrive(await create())
    d = await command(d, [pay(11000), all(d, 'check-out')])
    const id = d.financialEntries[0].id
    d = await command(d, [
      {
        type: 'edit-financial',
        entryId: id,
        entry: {
          kind: 'payment',
          amountCents: 10000,
          method: 'cash',
          paymentDate: '2026-10-09',
          reference: 'Actual receipt',
        },
      },
    ])
    expect(d.balanceCents).toBe(20000)
    expect(d.rooms[0].status).toBe('checked_out')
    expect(d.financialEntries).toHaveLength(1)
    expect(d.financialEntries[0]).toMatchObject({
      id,
      amountCents: 10000,
      paymentDate: '2026-10-09',
      reference: 'ACTUAL RECEIPT',
      voidedAt: null,
    })
    const report = await (await request('/payments?from=2026-10-09&to=2026-10-09')).json()
    expect(report).toMatchObject({ totalCents: 10000 })
  })
  it('deletes a payment on the wrong booking and permits entering it on another', async () => {
    let d = await command(await create(), [pay(10000)])
    const other = await create()
    const id = d.financialEntries[0].id
    await command(other, [{ type: 'delete-financial', entryId: id }], 400)
    await command(
      other,
      [
        {
          type: 'edit-financial',
          entryId: id,
          entry: { kind: 'payment', amountCents: 10000, method: 'cash', paymentDate: '2026-10-10' },
        },
      ],
      400,
    )
    d = await command(d, [{ type: 'delete-financial', entryId: id }])
    expect(d.paidCents).toBe(0)
    expect(d.financialEntries).toEqual([])
    expect(sqlite.prepare('SELECT id FROM financial_entries WHERE id=?').get(id)).toBeUndefined()
    expect((await command(other, [pay(10000)])).paidCents).toBe(10000)
  })
  it('deduplicates retries and rejects changed payloads without requiring current client versions', async () => {
    const d = await create(),
      body = { requestId: crypto.randomUUID(), version: d.version, actions: [pay(10000)] }
    expect((await request(`/reservations/${d.id}/commands`, 'POST', body)).status).toBe(200)
    expect((await request(`/reservations/${d.id}/commands`, 'POST', body)).status).toBe(200)
    expect(
      (await request(`/reservations/${d.id}/commands`, 'POST', { ...body, actions: [pay(20000)] }))
        .status,
    ).toBe(409)
    await command(d, [{ type: 'notes', notes: 'Saved from old screen' }])
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).paidCents).toBe(
      10000,
    )
  })
  it('keeps payment and stay edits atomic when a later action fails', async () => {
    let d = await command(await create(), [pay(11000)])
    const id = d.financialEntries[0].id
    await command(
      d,
      [{ type: 'delete-financial', entryId: id }, roomEdit(d, 0, { checkOut: '2026-10-09' })],
      400,
    )
    d = (await (await request(`/reservations/${d.id}`)).json()) as Detail
    expect(d.paidCents).toBe(11000)
    expect(d.financialEntries[0].id).toBe(id)
  })
  it('rejects whitespace reasons and invalid financial amounts', async () => {
    const d = await create()
    for (const amountCents of [0, -100, 1.5]) await command(d, [adjust('refund', amountCents)], 400)
    await command(
      d,
      [
        {
          type: 'financial',
          entry: { kind: 'payment', amountCents: 100, method: 'cash', paymentDate: 'invalid' },
        },
      ],
      400,
    )
  })
  it('previews checkout with debt without writing', async () => {
    const d = await arrive(await create())
    const r = await request(`/reservations/${d.id}/preview`, 'POST', {
      requestId: crypto.randomUUID(),
      version: d.version,
      actions: [all(d, 'check-out')],
    })
    expect(await r.json()).toMatchObject({
      totalCents: 30000,
      balanceCents: 30000,
      settlementBlocked: false,
    })
    expect(
      ((await (await request(`/reservations/${d.id}`)).json()) as Detail).rooms[0].status,
    ).toBe('checked_in')
  })
})

describe('workflow commit and recovery regressions', () => {
  it('deduplicates concurrent creation and rejects payload changes', async () => {
    const input = {
      requestId: crypto.randomUUID(),
      guest: { fullName: 'Retry Guest' },
      rooms: [
        {
          roomTypeId: 'type',
          adults: 1,
          children: 0,
          checkIn: '2026-10-10',
          checkOut: '2026-10-11',
        },
      ],
    }
    const responses = await Promise.all([
      request('/reservations', 'POST', input),
      request('/reservations', 'POST', input),
    ])
    expect(responses.map((r) => r.status)).toEqual([201, 201])
    const details = (await Promise.all(responses.map((r) => r.json()))) as Detail[]
    expect(details[0].id).toBe(details[1].id)
    expect(sqlite.prepare('SELECT count(*) AS n FROM reservations').get()?.n).toBe(1)
    expect((await request('/reservations', 'POST', { ...input, notes: 'changed' })).status).toBe(
      409,
    )
  })
  it('rejects one of two distinct bookings competing for the last room', async () => {
    await create(2)
    const responses = await Promise.all(
      [1, 2].map(() =>
        request('/reservations', 'POST', {
          requestId: crypto.randomUUID(),
          guest: { fullName: 'Last Room' },
          rooms: [
            {
              roomTypeId: 'type',
              adults: 1,
              children: 0,
              checkIn: '2026-10-10',
              checkOut: '2026-10-13',
            },
          ],
        }),
      ),
    )
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
  })
  it('rolls back extension dates and prices when another booking owns the added night', async () => {
    let d = await create(1, { checkIn: '2026-10-10', checkOut: '2026-10-11' })
    d = await command(d, [roomEdit(d)])
    let next = await create(1, { checkIn: '2026-10-11', checkOut: '2026-10-13' })
    next = await command(next, [roomEdit(next)])
    await command(d, [roomEdit(d, 0, { checkOut: '2026-10-12' })], 409)
    const fresh = (await (await request(`/reservations/${d.id}`)).json()) as Detail
    expect(fresh.rooms[0].checkOut).toBe('2026-10-11')
    expect(fresh.totalCents).toBe(10000)
    expect(fresh.version).toBe(d.version)
  })
  it('does not clear an assignment on a failed same-type move', async () => {
    let d = await arrive(await create())
    let other = await create()
    other = await command(other, [roomEdit(other, 0, { roomId: 'room-102' })])
    await command(d, [{ type: 'move', lineId: d.rooms[0].id, roomId: 'room-102' }], 409)
    d = (await (await request(`/reservations/${d.id}`)).json()) as Detail
    expect(d.rooms[0].roomId).toBe('room-101')
    expect(d.rooms[0].status).toBe('checked_in')
  })
  it('corrects a status directly after a room change', async () => {
    let d = await arrive(await create())
    d = await command(d, [roomEdit(d, 0, { roomId: 'room-102' })])
    d = await command(d, [{ type: 'set-status', lineId: d.rooms[0].id, status: 'confirmed' }])
    expect(d.rooms[0]).toMatchObject({
      roomId: 'room-102',
      status: 'confirmed',
      actualArrival: null,
    })
  })
  it('requires an active room after accidental removal and preserves cancelled room records', async () => {
    let d = await create(2)
    await command(
      d,
      d.rooms.map((l) => ({
        type: 'cancel-room' as const,
        lineId: l.id,
        reason: 'Extra',
        accidental: true,
      })),
      400,
    )
    d = await command(d, [
      { type: 'cancel-room', lineId: d.rooms[0].id, reason: 'Extra', accidental: true },
    ])
    expect(d.rooms[0].nights).toHaveLength(3)
    expect(d.rooms[0].cancellationReason).toBe('Extra')
    expect(d.rooms[1].status).toBe('confirmed')
  })
  it('permits a discount with checkout and never treats it as payment', async () => {
    let d = await arrive(await create(2))
    d = await command(d, [all(d, 'check-out'), setDiscount(20000)])
    expect(d.balanceCents).toBe(40000)
    expect(d.paidCents).toBe(0)
    expect(d.discountCents).toBe(20000)
    expect(d.rooms.every((l) => l.status === 'checked_out')).toBe(true)
  })
  it('previews conflicting assignment without changing anything', async () => {
    const a = await create(),
      b = await create()
    await command(a, [roomEdit(a)])
    const r = await request(`/reservations/${b.id}/preview`, 'POST', {
      requestId: crypto.randomUUID(),
      version: b.version,
      actions: [roomEdit(b)],
    })
    expect(r.status).toBe(409)
    expect(((await (await request(`/reservations/${b.id}`)).json()) as Detail).version).toBe(
      b.version,
    )
  })
})

describe('quick-edit contacts, staying guests, and payment details', () => {
  const guest = (reservationRoomId: string | null) => ({
    id: crypto.randomUUID(),
    reservationRoomId,
    fullName: 'Ana García',
    email: null,
    phone: null,
    documentType: 'DNI',
    documentNumber: '12345678',
  })
  it('saves contact changes and staying guests atomically, separate from the booking contact', async () => {
    let d = await create(2)
    const person = guest(d.rooms[0].id)
    const actions: WorkflowAction[] = [
      { type: 'contact', contact: { fullName: 'Booker Company', email: null, phone: null } },
      { type: 'set-guests', guests: [person, guest(null)] },
    ]
    const preview = await request(`/reservations/${d.id}/preview`, 'POST', {
      requestId: crypto.randomUUID(),
      version: d.version,
      actions,
    })
    expect(preview.status).toBe(200)
    expect(
      ((await (await request(`/reservations/${d.id}`)).json()) as Detail).stayingGuests,
    ).toEqual([])
    d = await command(d, actions)
    expect(d.guest.fullName).toBe('Booker Company')
    expect(d.stayingGuests).toHaveLength(2)
    expect(d.stayingGuests[0]).toMatchObject(person)
    d = await arrive(d)
    d = await command(d, [{ type: 'move', lineId: d.rooms[0].id, roomId: 'room-103' }])
    expect(d.stayingGuests[0].reservationRoomId).toBe(d.rooms[0].id)
    expect(d.rooms[0].roomId).toBe('room-103')
  })
  it('rejects foreign-room assignments and leaves contact, guests, and version unchanged on failure', async () => {
    const d = await create(),
      other = await create()
    await command(
      d,
      [
        { type: 'contact', contact: { fullName: 'Changed Name', email: null, phone: null } },
        { type: 'set-guests', guests: [guest(other.rooms[0].id)] },
      ],
      400,
    )
    const fresh = (await (await request(`/reservations/${d.id}`)).json()) as Detail
    expect(fresh.guest.fullName).toBe('Ada Lovelace')
    expect(fresh.stayingGuests).toEqual([])
    expect(fresh.version).toBe(d.version)
    await command(
      d,
      [{ type: 'set-guests', guests: [guest(null), guest(null)].map((g) => ({ ...g, id: d.id })) }],
      400,
    )
  })
  it('supports clearing optional guest fields and removing a guest', async () => {
    let d = await create()
    const person = { ...guest(null), email: 'ana@example.com', phone: '+51999123456' }
    d = await command(d, [{ type: 'set-guests', guests: [person] }])
    d = await command(d, [
      { type: 'set-guests', guests: [{ ...person, email: null, phone: null }] },
    ])
    expect(d.stayingGuests[0].email).toBeNull()
    d = await command(d, [{ type: 'set-guests', guests: [] }])
    expect(d.stayingGuests).toEqual([])
  })
  it('requires a valid payment date, accepts an optional reference, and keeps audit creation time separate', async () => {
    let d = await create()
    for (const paymentDate of [undefined, '', '2026-02-30', '2026-10-11']) {
      await command(
        d,
        [
          {
            type: 'financial',
            entry: { kind: 'payment', amountCents: 1000, method: 'cash', paymentDate },
          },
        ],
        400,
      )
    }
    d = await command(d, [
      {
        type: 'financial',
        entry: {
          kind: 'payment',
          amountCents: 1000,
          method: 'transfer',
          paymentDate: '2026-10-08',
          reference: ' op-123 ',
        },
      },
    ])
    const entry = d.financialEntries[0]
    expect(entry).toMatchObject({
      paymentDate: '2026-10-08',
      reference: 'OP-123',
      createdAt: '2026-10-10T15:00:00.000Z',
    })
    expect(d.payments[0].reference).toBe('OP-123')
    const report = (await (await request('/payments?from=2026-10-08&to=2026-10-08')).json()) as {
      payments: { reference: string }[]
    }
    expect(report.payments[0].reference).toBe('OP-123')
    d = await command(d, [
      {
        type: 'edit-financial',
        entryId: entry.id,
        entry: {
          kind: 'payment',
          amountCents: 1000,
          method: 'transfer',
          paymentDate: '2026-10-09',
          reference: 'oP-124',
        },
      },
    ])
    expect(d.financialEntries.find((e) => e.id === entry.id)?.reference).toBe('OP-124')
    expect(d.financialEntries).toHaveLength(1)
  })
})

describe('draft billing preview', () => {
  it('returns per-room draft prices without changing the saved reservation', async () => {
    const d = await create(2)
    const response = await request(`/reservations/${d.id}/preview`, 'POST', {
      requestId: crypto.randomUUID(),
      version: d.version,
      actions: [roomEdit(d, 0, { checkOut: '2026-10-15' })],
    })
    expect(response.status).toBe(200)
    const preview = (await response.json()) as Detail
    const room = preview.rooms.find((line) => line.id === d.rooms[0].id)!
    expect(room.subtotalCents).toBe(room.nights.reduce((sum, night) => sum + night.priceCents, 0))
    expect(room.discountCents).toBe(0)
    expect(room.totalCents).toBe(room.subtotalCents)
    expect(preview.subtotalCents).toBe(
      preview.rooms.reduce((sum, line) => sum + line.subtotalCents, 0),
    )
    const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail
    expect(saved.rooms).toEqual(d.rooms)
    expect(saved.version).toBe(d.version)
  })
})

describe('full guest names', () => {
  it('stores single and multipart names without splitting them', async () => {
    const d = await create()
    const fullName = 'María José de la Cruz García'
    const updated = await command(d, [
      { type: 'contact', contact: { fullName, email: null, phone: null } },
      {
        type: 'set-guests',
        guests: [
          {
            id: crypto.randomUUID(),
            fullName: '李',
            reservationRoomId: d.rooms[0].id,
            email: null,
            phone: null,
          },
        ],
      },
    ])
    expect(updated.guest.fullName).toBe(fullName)
    expect(updated.stayingGuests[0].fullName).toBe('李')
  })
})

describe('optional booking cancellation reason', () => {
  it('requires confirmation but permits an omitted reason', async () => {
    const d = await create()
    const rejected = await request(`/reservations/${d.id}/commands`, 'POST', {
      requestId: crypto.randomUUID(),
      version: d.version,
      actions: [{ type: 'cancel' }],
    })
    expect(rejected.status).toBe(400)
    const cancelled = await command(d, [{ type: 'cancel', confirmed: true }])
    expect(cancelled.rooms.every((room) => room.status === 'cancelled')).toBe(true)
    expect(cancelled.rooms[0].cancellationReason).toBeNull()
    expect(cancelled.totalCents).toBe(0)
  })
})

describe('optional room cancellation reason', () => {
  it('cancels one room without a reason and preserves the other stay', async () => {
    const d = await create(2)
    const updated = await command(d, [{ type: 'cancel-room', lineId: d.rooms[0].id }])
    expect(updated.rooms.find((room) => room.id === d.rooms[0].id)).toMatchObject({
      status: 'cancelled',
      cancellationReason: null,
    })
    expect(updated.rooms.find((room) => room.id === d.rooms[1].id)?.status).toBe('confirmed')
    expect(updated.cancelledAt).toBeNull()
  })
})

describe('editable final reservation record', () => {
  it('previews five nights becoming three and saves the dates, discount, and checkout together', async () => {
    let d = await arrive(await create(1, { checkIn: '2026-10-10', checkOut: '2026-10-15' }))
    d = await command(d, [pay(10000)])
    const actions: WorkflowAction[] = [
      roomEdit(d, 0, { checkOut: '2026-10-13' }),
      setDiscount(5000),
      all(d, 'check-out'),
    ]
    const response = await request(`/reservations/${d.id}/preview`, 'POST', {
      requestId: crypto.randomUUID(),
      version: d.version,
      actions,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      subtotalCents: 30000,
      totalCents: 25000,
      balanceCents: 15000,
      settlementBlocked: false,
    })
    expect(
      ((await (await request(`/reservations/${d.id}`)).json()) as Detail).rooms[0].checkOut,
    ).toBe('2026-10-15')
    d = await command(d, actions)
    expect(d).toMatchObject({ totalCents: 25000, balanceCents: 15000 })
    expect(d.rooms[0]).toMatchObject({ status: 'checked_out', checkOut: '2026-10-13' })
    const next = await create(1, { checkIn: '2026-10-13', checkOut: '2026-10-15' })
    await command(next, [roomEdit(next)])
    expect(d.history).toEqual([])
  })
  it('edits completed dates and counts without changing the status or another room', async () => {
    let d = await arrive(await create(2))
    d = await command(d, [all(d, 'check-out')])
    const other = d.rooms[1]
    d = await command(d, [
      roomEdit(d, 0, { checkIn: '2026-10-09', checkOut: '2026-10-12', adults: 2 }),
    ])
    expect(d.rooms[0]).toMatchObject({
      status: 'checked_out',
      adults: 2,
      checkIn: '2026-10-09',
      checkOut: '2026-10-12',
    })
    expect(d.rooms[1]).toEqual(other)
  })
  it('rejects completed-date conflicts in both preview and commit without changing payment or stay', async () => {
    let d = await arrive(await create(1, { checkIn: '2026-10-10', checkOut: '2026-10-11' }))
    d = await command(d, [all(d, 'check-out'), pay(11000)])
    const next = await create(1, { checkIn: '2026-10-11', checkOut: '2026-10-13' })
    await command(next, [roomEdit(next)])
    const actions: WorkflowAction[] = [
      {
        type: 'edit-financial',
        entryId: d.financialEntries[0].id,
        entry: { kind: 'payment', amountCents: 10000, method: 'cash', paymentDate: '2026-10-10' },
      },
      roomEdit(d, 0, { checkOut: '2026-10-12' }),
    ]
    const preview = await request(`/reservations/${d.id}/preview`, 'POST', {
      requestId: crypto.randomUUID(),
      version: d.version,
      actions,
    })
    expect(preview.status).toBe(409)
    await command(d, actions, 409)
    const fresh = (await (await request(`/reservations/${d.id}`)).json()) as Detail
    expect(fresh.paidCents).toBe(11000)
    expect(fresh.rooms[0].checkOut).toBe('2026-10-11')
  })
  it('keeps no-shows billable while releasing availability and checks restoration conflicts', async () => {
    let d = await arrive(await create())
    d = await command(d, [
      pay(10000),
      { type: 'set-status', lineId: d.rooms[0].id, status: 'no_show' },
    ])
    expect(d).toMatchObject({ totalCents: 30000, paidCents: 10000, balanceCents: 20000, creditCents: 0 })
    expect(d.financialEntries[0].amountCents).toBe(10000)
    const next = await create()
    await command(next, [roomEdit(next)])
    const actions: WorkflowAction[] = [
      { type: 'set-status', lineId: d.rooms[0].id, status: 'confirmed' },
    ]
    expect(
      (
        await request(`/reservations/${d.id}/preview`, 'POST', {
          requestId: crypto.randomUUID(),
          version: d.version,
          actions,
        })
      ).status,
    ).toBe(409)
    await command(d, actions, 409)
    expect(await (await request('/payments?from=2026-10-10&to=2026-10-10')).json()).toMatchObject({
      payments: [{ amountCents: 10000 }],
      totalCents: 10000,
    })
  })
  it('restores a cancelled booking through the ordinary label edit', async () => {
    let d = await command(await create(), [pay(10000), setDiscount(1000)])
    d = await command(d, [{ type: 'cancel', confirmed: true }])
    expect(d.balanceCents).toBe(-10000)
    d = await command(d, [{ type: 'set-status', lineId: d.rooms[0].id, status: 'confirmed' }])
    expect(d.cancelledAt).toBeNull()
    expect(d).toMatchObject({ totalCents: 29000, paidCents: 10000, balanceCents: 19000 })
  })
  it('rejects invalid payment edits atomically and deduplicates edits and deletes', async () => {
    let d = await command(await create(), [pay(11000)])
    const id = d.financialEntries[0].id
    for (const entry of [
      { kind: 'payment', amountCents: 0, method: 'cash', paymentDate: '2026-10-10' },
      { kind: 'payment', amountCents: 10000, method: 'cash', paymentDate: '2026-10-11' },
      { kind: 'discount', amountCents: 10000 },
    ]) {
      const response = await request(`/reservations/${d.id}/commands`, 'POST', {
        requestId: crypto.randomUUID(),
        version: d.version,
        actions: [{ type: 'edit-financial', entryId: id, entry }],
      })
      expect(response.status).toBe(400)
    }
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).paidCents).toBe(
      11000,
    )
    for (const action of [
      {
        type: 'edit-financial',
        entryId: id,
        entry: { kind: 'payment', amountCents: 10000, method: 'card', paymentDate: '2026-10-10' },
      },
      { type: 'delete-financial', entryId: id },
    ]) {
      const body = { requestId: crypto.randomUUID(), version: d.version, actions: [action] }
      expect((await request(`/reservations/${d.id}/commands`, 'POST', body)).status).toBe(200)
      expect((await request(`/reservations/${d.id}/commands`, 'POST', body)).status).toBe(200)
    }
    d = (await (await request(`/reservations/${d.id}`)).json()) as Detail
    expect(d.financialEntries).toEqual([])
    expect(d.balanceCents).toBe(30000)
  })
})
