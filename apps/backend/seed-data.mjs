import { readFileSync } from 'node:fs'

const roomSeed = readFileSync(new URL('./seed.sql', import.meta.url), 'utf8')

export function referenceDate(value = new Date().toISOString().slice(0, 10)) {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Date must be a valid UTC calendar date in YYYY-MM-DD format')
  }
  return value
}

// Arrival offsets and closure ranges are relative to the reference date.
// A missing room means the booking is ready for manual assignment in the portal.
const examples = [
  { id: 'departed', name: ['Morgan', 'Reed'], arrival: -8, nights: 3, status: 'checked_out', payment: 'full', rooms: [{ type: 'standard', room: '101', adults: 2 }] },
  { id: 'in-house', name: ['Taylor', 'Brooks'], arrival: -2, nights: 4, status: 'checked_in', payment: 'deposit', rooms: [{ type: 'standard', room: '101', adults: 2 }] },
  { id: 'turnover', name: ['Casey', 'Lopez'], arrival: 2, nights: 3, payment: 'deposit', rooms: [{ type: 'standard', room: '101', adults: 1 }] },
  { id: 'arrival', name: ['Riley', "O'Brien"], arrival: 0, nights: 3, rooms: [{ type: 'standard', room: '102', adults: 2 }] },
  { id: 'upcoming', name: ['Jordan', 'Kim'], arrival: 4, nights: 4, payment: 'deposit', rooms: [{ type: 'standard', room: '103', adults: 1 }] },
  { id: 'alex', name: ['Alex', 'Demo'], arrival: 0, nights: 1, rooms: [{ type: 'standard', adults: 1 }] },
  { id: 'sam', name: ['Sam', 'Demo'], arrival: 1, nights: 3, rooms: [{ type: 'deluxe', adults: 2 }] },
  { id: 'jamie', name: ['Jamie', 'Demo'], arrival: 0, nights: 9, payment: 'deposit', rooms: [{ type: 'standard', adults: 2 }, { type: 'suite', adults: 2, children: 2 }] },
  { id: 'cancelled', name: ['Avery', 'Wilson'], arrival: 3, nights: 2, status: 'cancelled', payment: 'refund', rooms: [{ type: 'deluxe', adults: 2 }] },
  { id: 'no-show', name: ['Drew', 'Martin'], arrival: -1, nights: 2, status: 'no_show', rooms: [{ type: 'standard', adults: 1 }] },
  { id: 'family', name: ['Robin', 'Garcia'], arrival: 0, nights: 4, payment: 'full', rooms: [{ type: 'suite', room: '301', adults: 2, children: 2 }] },
  { id: 'group', name: ['Cameron', 'Singh'], arrival: 2, nights: 3, payment: 'deposit', rooms: [{ type: 'deluxe', room: '201', adults: 2 }, { type: 'deluxe', room: '202', adults: 2, children: 1 }] },
  { id: 'long-stay', name: ['Quinn', 'Davis'], arrival: -3, nights: 10, status: 'checked_in', payment: 'deposit', rooms: [{ type: 'standard', room: '105', adults: 1, flatRateCents: 9500 }] },
  { id: 'next-week', name: ['Skyler', 'Brown'], arrival: 7, nights: 4, rooms: [{ type: 'standard', room: '106', adults: 2 }] },
  { id: 'suite', name: ['Emerson', 'Lee'], arrival: 2, nights: 3, payment: 'full', rooms: [{ type: 'suite', room: '302', adults: 2 }] },
  { id: 'departure', name: ['Finley', 'Patel'], arrival: -3, nights: 3, status: 'checked_in', payment: 'full', rooms: [{ type: 'deluxe', room: '203', adults: 2 }] },
]

function literal(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

function insert(table, row) {
  return `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(literal).join(', ')});`
}

export function buildResetSql(value) {
  const anchor = referenceDate(value)
  function date(offset) {
    const result = new Date(`${anchor}T00:00:00.000Z`)
    result.setUTCDate(result.getUTCDate() + offset)
    const formatted = result.toISOString().slice(0, 10)
    // Reject dates outside the app's four-digit-year format before touching D1.
    return referenceDate(formatted)
  }

  const createdAt = `${date(-14)}T12:00:00.000Z`
  const statements = [
    'DELETE FROM reservation_room_nights;',
    'DELETE FROM payments;',
    'DELETE FROM reservation_rooms;',
    'DELETE FROM reservations;',
    'DELETE FROM room_closures;',
    'DELETE FROM room_type_rates;',
    'DELETE FROM guests;',
    'DELETE FROM rooms;',
    'DELETE FROM room_types;',
    roomSeed,
  ]

  // Read the baseline prices from the same seed that creates the room types.
  const baseRates = new Map()
  for (const match of roomSeed.matchAll(/\('type-([^']+)', '[^']+', \d+, (\d+),/g)) {
    baseRates.set(match[1], Number(match[2]))
  }
  const overrides = new Map()
  for (const [type, baseRate] of baseRates) {
    for (const offset of [4, 5, 11, 12]) {
      const day = date(offset)
      const price = baseRate + 2000
      overrides.set(`${type}:${day}`, price)
      statements.push(insert('room_type_rates', {
        id: `rate-${type}-${day}`, room_type_id: `type-${type}`, date: day, price_cents: price,
      }))
    }
  }

  for (const [room, starts, ends, reason] of [
    ['110', -1, 3, 'Bathroom repairs'],
    ['210', 4, 7, 'Air conditioning maintenance'],
    ['310', 1, 4, 'Carpet replacement'],
  ]) {
    statements.push(insert('room_closures', {
      id: `closure-${room}`, room_id: `room-${room}`, starts: date(starts), ends: date(ends), reason, created_at: createdAt,
    }))
  }

  for (const [index, example] of examples.entries()) {
    const guestId = `guest-${example.id}`
    const reservationId = `reservation-${example.id}`
    const checkIn = date(example.arrival)
    const checkOut = date(example.arrival + example.nights)
    statements.push(insert('guests', {
      id: guestId, first_name: example.name[0], last_name: example.name[1],
      email: `${example.id}@example.com`, phone: `+1-202-555-${String(100 + index).padStart(4, '0')}`,
      document_type: 'passport', document_number: `DEMO-${String(index + 1).padStart(4, '0')}`,
      notes: 'Dummy guest for local portal testing.', created_at: createdAt,
    }))
    statements.push(insert('reservations', {
      id: reservationId, code: `DEMO${String(index + 1).padStart(4, '0')}`, guest_id: guestId,
      check_in: checkIn, check_out: checkOut, source: 'desk',
      notes: `Sample ${example.id} booking. Reset with pnpm db:reset:local.`, created_at: createdAt,
    }))

    let total = 0
    for (const [lineIndex, room] of example.rooms.entries()) {
      const baseRate = baseRates.get(room.type)
      if (baseRate === undefined) throw new Error(`Missing type-${room.type} in seed.sql`)
      const lineId = `line-${example.id}-${lineIndex + 1}`
      statements.push(insert('reservation_rooms', {
        id: lineId, reservation_id: reservationId, room_type_id: `type-${room.type}`,
        room_id: room.room ? `room-${room.room}` : null, adults: room.adults, children: room.children ?? 0,
        status: example.status ?? 'confirmed', created_at: createdAt,
      }))
      for (let night = 0; night < example.nights; night++) {
        const day = date(example.arrival + night)
        const price = room.flatRateCents ?? overrides.get(`${room.type}:${day}`) ?? baseRate
        total += price
        statements.push(insert('reservation_room_nights', {
          id: `night-${lineId}-${day}`, reservation_room_id: lineId, date: day, price_cents: price,
        }))
      }
    }

    if (example.payment) {
      const amount = example.payment === 'full' ? total : Math.floor(total / 2)
      statements.push(insert('payments', {
        id: `payment-${example.id}`, reservation_id: reservationId, amount_cents: amount,
        method: index % 2 === 0 ? 'card' : 'transfer', reference: `DEMO-${example.id}`,
        paid_at: `${date(example.arrival - 1)}T12:00:00.000Z`, notes: 'Sample payment.',
      }))
      if (example.payment === 'refund') {
        statements.push(insert('payments', {
          id: `refund-${example.id}`, reservation_id: reservationId, amount_cents: -amount,
          method: 'card', reference: `DEMO-REFUND-${example.id}`,
          paid_at: `${date(example.arrival)}T12:00:00.000Z`, notes: 'Refund for cancelled sample booking.',
        }))
      }
    }
  }
  return statements.join('\n')
}
