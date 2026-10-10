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

// Run the actual Hono routes and Drizzle SQL against SQLite with D1-style batches.
function statement(sql: string, params: SQLInputValue[] = []) {
  return {
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    raw: async () => {
      // The subquery gives duplicate join columns distinct names on Node 22.
      return sqlite.prepare(`SELECT * FROM (${sql})`).all(...params).map((row) => Object.values(row))
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
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8')) as { entries: { tag: string }[] }
  for (const { tag } of journal.entries) sqlite.exec(readFileSync(new URL(`${tag}.sql`, dir), 'utf8'))
  sqlite.exec(`
    INSERT INTO room_types VALUES ('type', 'King', 2, 10000, '2026-10-10');
    INSERT INTO rooms VALUES ('room-101', '101', 'type'), ('room-102', '102', 'type'), ('room-103', '103', 'type');
  `)
  binding = {
    prepare: (sql: string) => statement(sql),
    batch: async (queries: ReturnType<typeof statement>[]) => {
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
    },
  } as unknown as D1Database
})

afterEach(() => {
  sqlite.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function request(path: string, method = 'GET', body?: unknown) {
  return app.request(path, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }, { DB: binding, CURRENCY: 'PEN' })
}

async function create(options: { checkIn?: string; checkOut?: string; discounts?: number[] } = {}) {
  const response = await request('/reservations', 'POST', {
    guest: { firstName: 'Ada', lastName: 'Lovelace' },
    checkIn: options.checkIn ?? '2026-10-10',
    checkOut: options.checkOut ?? '2026-10-13',
    rooms: (options.discounts ?? [0]).map((discountCents) => ({ roomTypeId: 'type', adults: 1, discountCents })),
  })
  expect(response.status).toBe(201)
  return response.json() as Promise<Detail>
}

async function checkIn(detail: Detail) {
  for (const [index, line] of detail.rooms.entries()) {
    const response = await request(`/reservations/${detail.id}/rooms/${line.id}/assign-room`, 'POST', { roomId: `room-${101 + index}` })
    expect(response.status).toBe(200)
  }
  expect((await request(`/reservations/${detail.id}/check-in`, 'POST')).status).toBe(200)
}

describe('room unassignment', () => {
  it('clears the room number while preserving the reservation, charges, discount, and payments', async () => {
    const detail = await create({ discounts: [6000] })
    const path = `/reservations/${detail.id}/rooms/${detail.rooms[0].id}`
    expect((await request(`${path}/assign-room`, 'POST', { roomId: 'room-101' })).status).toBe(200)
    const paid = await (await request(`/reservations/${detail.id}/payments`, 'POST', { amountCents: 30000, method: 'cash' })).json() as Detail
    const response = await request(`${path}/unassign-room`, 'POST')
    expect(response.status).toBe(200)
    const unassigned = await response.json() as Detail
    expect(unassigned).toMatchObject({
      id: paid.id, checkIn: paid.checkIn, checkOut: paid.checkOut,
      totalCents: paid.totalCents, paidCents: paid.paidCents, balanceCents: paid.balanceCents,
      payments: paid.payments,
    })
    expect(unassigned.rooms).toEqual([{
      ...paid.rooms[0], roomId: null, roomNumber: null,
    }])
    expect((await request(`${path}/check-in`, 'POST')).status).toBe(400)
    expect((await request(`${path}/unassign-room`, 'POST')).status).toBe(200)
    expect((await request(`${path}/assign-room`, 'POST', { roomId: 'room-102' })).status).toBe(200)
  })

  it('frees the physical room while keeping room-type inventory reserved', async () => {
    const detail = await create({ discounts: [0, 0] })
    const first = `/reservations/${detail.id}/rooms/${detail.rooms[0].id}`
    const second = `/reservations/${detail.id}/rooms/${detail.rooms[1].id}`
    expect((await request(`${first}/assign-room`, 'POST', { roomId: 'room-101' })).status).toBe(200)
    expect((await request(`${first}/unassign-room`, 'POST')).status).toBe(200)
    expect((await request(`${second}/assign-room`, 'POST', { roomId: 'room-101' })).status).toBe(200)
    const capacity = await request('/reservations', 'POST', {
      guest: { firstName: 'Grace', lastName: 'Hopper' }, checkIn: detail.checkIn, checkOut: detail.checkOut,
      rooms: [{ roomTypeId: 'type', adults: 1 }, { roomTypeId: 'type', adults: 1 }],
    })
    expect(capacity.status).toBe(409)
  })

  it.each(['checked_in', 'checked_out', 'cancelled', 'no_show'])('rejects unassigning a %s room', async (status) => {
    const detail = await create()
    const path = `/reservations/${detail.id}/rooms/${detail.rooms[0].id}`
    await request(`${path}/assign-room`, 'POST', { roomId: 'room-101' })
    sqlite.prepare('UPDATE reservation_rooms SET status = ? WHERE id = ?').run(status, detail.rooms[0].id)
    const response = await request(`${path}/unassign-room`, 'POST')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'only a confirmed room can be unassigned' })
    expect(sqlite.prepare('SELECT room_id FROM reservation_rooms WHERE id = ?').get(detail.rooms[0].id))
      .toEqual({ room_id: 'room-101' })
  })

  it('rejects unknown room lines and lines belonging to another reservation', async () => {
    const first = await create()
    const second = await create()
    expect((await request(`/reservations/${first.id}/rooms/missing/unassign-room`, 'POST')).status).toBe(404)
    expect((await request(`/reservations/${first.id}/rooms/${second.rooms[0].id}/unassign-room`, 'POST')).status).toBe(404)
  })
})

describe('payment methods', () => {
  it('records Yape payments and returns them in payment history with the updated balance', async () => {
    const detail = await create()
    const response = await request(`/reservations/${detail.id}/payments`, 'POST', {
      amountCents: 5000, method: 'yape', reference: 'YAPE-123',
    })
    expect(response.status).toBe(201)
    const paid = await response.json() as Detail
    expect(paid).toMatchObject({ currency: 'PEN', paidCents: 5000, balanceCents: 25000 })
    expect(paid.payments).toEqual([expect.objectContaining({ amountCents: 5000, method: 'yape', reference: 'YAPE-123' })])
    expect(await (await request(`/reservations/${detail.id}/payments`)).json()).toEqual(paid.payments)
    expect(sqlite.prepare('SELECT method, amount_cents FROM payments WHERE reservation_id = ?').get(detail.id))
      .toEqual({ method: 'yape', amount_cents: 5000 })
  })
})

describe('per-room stay discounts', () => {
  it('defaults existing bookings to zero discount when upgrading the database', () => {
    const old = new DatabaseSync(':memory:')
    try {
      const dir = new URL('../../drizzle/', import.meta.url)
      const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8')) as { entries: { tag: string }[] }
      const migrationIndex = journal.entries.findIndex(({ tag }) => tag === '0006_shiny_starjammers')
      for (const { tag } of journal.entries.slice(0, migrationIndex)) old.exec(readFileSync(new URL(`${tag}.sql`, dir), 'utf8'))
      old.exec(`
        INSERT INTO room_types VALUES ('type', 'King', 2, 10000, '2026-10-10');
        INSERT INTO rooms VALUES ('room', '101', 'type');
        INSERT INTO guests (id, first_name, last_name, created_at) VALUES ('guest', 'Ada', 'Lovelace', '2026-10-10');
        INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
          VALUES ('stay', 'STAY', 'guest', '2026-10-10', '2026-10-13', '2026-10-10');
        INSERT INTO reservation_rooms (id, reservation_id, room_type_id, adults, status, created_at)
          VALUES ('line', 'stay', 'type', 1, 'confirmed', '2026-10-10');
      `)
      old.exec(readFileSync(new URL(`${journal.entries[migrationIndex].tag}.sql`, dir), 'utf8'))
      expect(old.prepare('SELECT discount_cents FROM reservation_rooms').get()).toEqual({ discount_cents: 0 })
    } finally {
      old.close()
    }
  })

  it('subtracts each room discount once and keeps list/detail balances consistent', async () => {
    const detail = await create({ discounts: [6000, 3000] })
    expect(detail).toMatchObject({ subtotalCents: 60000, discountCents: 9000, totalCents: 51000 })
    expect(detail.rooms.map((line) => line.totalCents)).toEqual([24000, 27000])
    expect(detail.rooms[0].nights.map((night) => night.priceCents)).toEqual([10000, 10000, 10000])
    const paid = await request(`/reservations/${detail.id}/payments`, 'POST', { amountCents: 60000, method: 'cash' })
    expect(await paid.json()).toMatchObject({ paidCents: 60000, balanceCents: -9000 })
    const list = await request('/reservations')
    expect(await list.json()).toEqual([expect.objectContaining({ totalCents: 51000, paidCents: 60000, balanceCents: -9000 })])
  })

  it.each([-1, 1.5, 30001])('rejects invalid or excessive discounts without saving a booking: %s', async (discountCents) => {
    const response = await request('/reservations', 'POST', {
      guest: { firstName: 'Ada', lastName: 'Lovelace' }, checkIn: '2026-10-10', checkOut: '2026-10-13',
      rooms: [{ roomTypeId: 'type', adults: 1, discountCents }],
    })
    expect(response.status).toBe(400)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM reservations').get()).toEqual({ count: 0 })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM guests').get()).toEqual({ count: 0 })
  })

  it('saves discounts on added rooms and excludes cancelled rooms from the bill', async () => {
    const detail = await create({ discounts: [6000] })
    const response = await request(`/reservations/${detail.id}/rooms`, 'POST', { roomTypeId: 'type', adults: 1, discountCents: 5000 })
    expect(response.status).toBe(201)
    const added = await response.json() as Detail
    expect(added).toMatchObject({ subtotalCents: 60000, discountCents: 11000, totalCents: 49000 })
    const cancelled = await request(`/reservations/${detail.id}/rooms/${detail.rooms[0].id}/cancel`, 'POST')
    expect(await cancelled.json()).toMatchObject({ subtotalCents: 30000, discountCents: 5000, totalCents: 25000 })
  })

  it('keeps a fixed discount on extension and caps it when the stay is shortened', async () => {
    const detail = await create({ discounts: [25000] })
    let response = await request(`/reservations/${detail.id}`, 'PATCH', { checkOut: '2026-10-14' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ subtotalCents: 40000, discountCents: 25000, totalCents: 15000 })
    response = await request(`/reservations/${detail.id}`, 'PATCH', { checkOut: '2026-10-11' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ subtotalCents: 10000, discountCents: 10000, totalCents: 0 })
    expect(sqlite.prepare('SELECT discount_cents FROM reservation_rooms').get()).toEqual({ discount_cents: 10000 })
  })

  it('validates an edited discount against the new charges and rejects unrelated room IDs', async () => {
    const detail = await create()
    const response = await request(`/reservations/${detail.id}`, 'PATCH', {
      checkOut: '2026-10-11', rooms: [{ id: detail.rooms[0].id, discountCents: 10001 }],
    })
    expect(response.status).toBe(400)
    expect(await (await request(`/reservations/${detail.id}`)).json()).toMatchObject({ checkOut: '2026-10-13', totalCents: 30000 })
    const unknown = await request(`/reservations/${detail.id}`, 'PATCH', { rooms: [{ id: 'other', discountCents: 0 }] })
    expect(unknown.status).toBe(404)
  })
})

describe('checkout billing', () => {
  it('allows same-day party checkout, keeps first-night charges, and releases rooms', async () => {
    const detail = await create({ discounts: [6000, 25000] })
    await checkIn(detail)
    const response = await request(`/reservations/${detail.id}/check-out`, 'POST')
    expect(response.status).toBe(200)
    const out = await response.json() as Detail
    expect(out).toMatchObject({ checkIn: '2026-10-10', checkOut: '2026-10-10', nights: 0, subtotalCents: 20000, discountCents: 16000, totalCents: 4000 })
    expect(out.rooms.map((line) => line.status)).toEqual(['checked_out', 'checked_out'])
    expect(out.rooms[0].nights).toEqual([{ date: '2026-10-10', priceCents: 10000 }])
    const next = await create({ discounts: [0] })
    expect((await request(`/reservations/${next.id}/rooms/${next.rooms[0].id}/assign-room`, 'POST', { roomId: 'room-101' })).status).toBe(200)
    expect((await request('/room-closures', 'POST', { roomId: 'room-102', starts: '2026-10-10', ends: '2026-10-11' })).status).toBe(201)
  })

  it('allows staff to adjust, waive, and remove a discount after checkout without changing payments or nightly prices', async () => {
    const detail = await create({ discounts: [6000] })
    await checkIn(detail)
    await request(`/reservations/${detail.id}/payments`, 'POST', { amountCents: 30000, method: 'cash' })
    await request(`/reservations/${detail.id}/check-out`, 'POST')
    for (const [discountCents, totalCents] of [[2000, 8000], [10000, 0], [0, 10000]]) {
      const response = await request(`/reservations/${detail.id}`, 'PATCH', { rooms: [{ id: detail.rooms[0].id, discountCents }] })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ totalCents, paidCents: 30000, balanceCents: totalCents - 30000,
        rooms: [expect.objectContaining({ status: 'checked_out', nights: [{ date: '2026-10-10', priceCents: 10000 }] })] })
    }
  })

  it('preserves the first room bill when the remaining room departs on the next day', async () => {
    const detail = await create({ discounts: [6000, 6000] })
    await checkIn(detail)
    const first = await request(`/reservations/${detail.id}/rooms/${detail.rooms[0].id}/check-out`, 'POST')
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ checkOut: '2026-10-13', totalCents: 28000 })
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
    const response = await request(`/reservations/${detail.id}/check-out`, 'POST')
    expect(response.status).toBe(200)
    const out = await response.json() as Detail
    expect(out).toMatchObject({ checkOut: '2026-10-11', totalCents: 8000 })
    expect(out.rooms.map((line) => line.totalCents)).toEqual([4000, 4000])
  })

  it('removes future nights without prorating the discount on a normal early departure', async () => {
    const detail = await create({ checkIn: '2026-10-08', discounts: [6000] })
    await checkIn(detail)
    const response = await request(`/reservations/${detail.id}/check-out`, 'POST')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ checkOut: '2026-10-10', subtotalCents: 20000, discountCents: 6000, totalCents: 14000 })
  })

  it.each(['2026-10-09', '2026-10-10'])('keeps all booked charges and departure date for checkout on or after %s', async (checkOut) => {
    const detail = await create({ checkIn: '2026-10-08', checkOut, discounts: [6000] })
    await checkIn(detail)
    const response = await request(`/reservations/${detail.id}/check-out`, 'POST')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ checkOut, subtotalCents: detail.subtotalCents, discountCents: 6000, totalCents: detail.totalCents })
  })

  it('requires confirmed rooms to be resolved and rejects checkout before the arrival date', async () => {
    const detail = await create({ discounts: [0, 0] })
    await request(`/reservations/${detail.id}/rooms/${detail.rooms[0].id}/assign-room`, 'POST', { roomId: 'room-101' })
    await request(`/reservations/${detail.id}/rooms/${detail.rooms[0].id}/check-in`, 'POST')
    expect((await request(`/reservations/${detail.id}/check-out`, 'POST')).status).toBe(400)
    const future = await create({ checkIn: '2026-10-11', checkOut: '2026-10-12' })
    await request(`/reservations/${future.id}/rooms/${future.rooms[0].id}/assign-room`, 'POST', { roomId: 'room-103' })
    await request(`/reservations/${future.id}/check-in`, 'POST')
    expect((await request(`/reservations/${future.id}/check-out`, 'POST')).status).toBe(400)
    expect((await request(`/reservations/${future.id}/rooms/${future.rooms[0].id}/check-out`, 'POST')).status).toBe(400)
  })

  it('rolls back charges, discounts, and status if the checkout batch fails', async () => {
    const detail = await create({ discounts: [25000] })
    await checkIn(detail)
    sqlite.exec(`CREATE TRIGGER fail_checkout BEFORE UPDATE OF check_out ON reservations
      BEGIN SELECT RAISE(ABORT, 'test failure'); END;`)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await request(`/reservations/${detail.id}/check-out`, 'POST')).status).toBe(500)
    expect(await (await request(`/reservations/${detail.id}`)).json()).toMatchObject({
      checkOut: '2026-10-13', subtotalCents: 30000, discountCents: 25000,
      rooms: [expect.objectContaining({ status: 'checked_in', discountCents: 25000 })],
    })
  })
})

describe('bulk status changes', () => {
  it('undoes check-in for every checked-in room while keeping assignments, dates, prices, and payments', async () => {
    const detail = await create({ discounts: [0, 0] })
    await checkIn(detail)
    await request(`/reservations/${detail.id}/payments`, 'POST', { amountCents: 10000, method: 'cash' })
    const response = await request(`/reservations/${detail.id}/undo-check-in`, 'POST')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      checkIn: '2026-10-10', checkOut: '2026-10-13', totalCents: 60000, paidCents: 10000,
      rooms: [
        expect.objectContaining({ status: 'confirmed', roomId: 'room-101' }),
        expect.objectContaining({ status: 'confirmed', roomId: 'room-102' }),
      ],
    })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM reservation_room_nights').get()).toEqual({ count: 6 })
    expect((await request(`/reservations/${detail.id}/check-in`, 'POST')).status).toBe(200)
  })

  it('leaves checked-out and cancelled rooms alone and rejects undo when nothing is checked in', async () => {
    const detail = await create({ discounts: [0, 0, 0] })
    await checkIn(detail)
    await request(`/reservations/${detail.id}/rooms/${detail.rooms[0].id}/check-out`, 'POST')
    const response = await request(`/reservations/${detail.id}/undo-check-in`, 'POST')
    expect(response.status).toBe(200)
    expect((await response.json() as Detail).rooms.map((line) => line.status)).toEqual(['checked_out', 'confirmed', 'confirmed'])
    expect((await request(`/reservations/${detail.id}/undo-check-in`, 'POST')).status).toBe(400)
    expect((await request('/reservations/missing/undo-check-in', 'POST')).status).toBe(404)
  })
})
