import { readFileSync } from 'node:fs'

const roomSeed = readFileSync(new URL('./seed.sql', import.meta.url), 'utf8')

export function referenceDate(value = new Date().toISOString().slice(0, 10)) {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Date must be a valid UTC calendar date in YYYY-MM-DD format')
  }
  return value
}

// Arrival offsets and closure ranges are relative to the reference date.
// A missing room means the booking is ready for manual assignment in the portal.
const examples = [
  {
    id: 'departed',
    name: ['Valeria', 'Rojas'],
    arrival: -8,
    nights: 3,
    status: 'checked_out',
    payment: 'deposit',
    method: 'cash',
    rooms: [{ type: 'standard', room: '101', adults: 2 }],
  },
  {
    id: 'in-house',
    name: ['Diego', 'Salazar'],
    arrival: -2,
    nights: 4,
    status: 'checked_in',
    payment: 'deposit',
    rooms: [{ type: 'standard', room: '101', adults: 2, discountCents: 2000 }],
  },
  {
    id: 'turnover',
    name: ['Mateo', 'Flores'],
    arrival: 2,
    nights: 3,
    payment: 'deposit',
    rooms: [{ type: 'standard', room: '101', adults: 1 }],
  },
  {
    id: 'arrival',
    name: ['Camila', "O'Brien"],
    arrival: 0,
    nights: 3,
    rooms: [{ type: 'standard', room: '102', adults: 2, discountCents: 1500 }],
  },
  {
    id: 'upcoming',
    name: ['Lucía', 'Torres'],
    arrival: 4,
    nights: 4,
    payment: 'deposit',
    rooms: [{ type: 'standard', room: '103', adults: 1 }],
  },
  {
    id: 'alex',
    name: ['Alejandro', 'Demo'],
    arrival: 0,
    nights: 1,
    rooms: [{ type: 'standard', adults: 1 }],
  },
  {
    id: 'sam',
    name: ['Sofía', 'Demo'],
    arrival: 1,
    nights: 3,
    rooms: [{ type: 'deluxe', adults: 2 }],
  },
  {
    id: 'jamie',
    name: ['Javier', 'Demo'],
    arrival: 0,
    nights: 9,
    payment: 'deposit',
    rooms: [
      { type: 'standard', adults: 2, discountCents: 9000 },
      { type: 'suite', adults: 2, children: 2, discountCents: 12000 },
    ],
  },
  {
    id: 'cancelled',
    name: ['Daniela', 'Vargas'],
    arrival: 3,
    nights: 2,
    status: 'cancelled',
    payment: 'deposit',
    rooms: [{ type: 'deluxe', adults: 2, discountCents: 4000 }],
  },
  {
    id: 'no-show',
    name: ['Sebastián', 'Castro'],
    arrival: -1,
    nights: 2,
    status: 'no_show',
    rooms: [{ type: 'standard', adults: 1 }],
  },
  {
    id: 'family',
    name: ['Mariana', 'García'],
    arrival: 0,
    nights: 4,
    payment: 'full',
    rooms: [{ type: 'suite', room: '301', adults: 2, children: 2, discountCents: 10000 }],
  },
  {
    id: 'group',
    name: ['Andrés', 'Quispe'],
    arrival: 2,
    nights: 3,
    payment: 'deposit',
    rooms: [
      { type: 'deluxe', room: '201', adults: 2, discountCents: 3000 },
      { type: 'deluxe', room: '202', adults: 2, children: 1, discountCents: 5000 },
    ],
  },
  {
    id: 'long-stay',
    name: ['Renato', 'Díaz'],
    arrival: -3,
    nights: 10,
    status: 'checked_in',
    payment: 'deposit',
    rooms: [{ type: 'standard', room: '105', adults: 1, flatRateCents: 9500, discountCents: 4500 }],
  },
  {
    id: 'next-week',
    name: ['Paola', 'Mendoza'],
    arrival: 7,
    nights: 4,
    rooms: [{ type: 'standard', room: '106', adults: 2 }],
  },
  {
    id: 'suite',
    name: ['Gabriela', 'Luna'],
    arrival: 2,
    nights: 3,
    payment: 'full',
    rooms: [{ type: 'suite', room: '302', adults: 2 }],
  },
  {
    id: 'departure',
    name: ['Bruno', 'Chávez'],
    arrival: -3,
    nights: 3,
    status: 'checked_in',
    payment: 'full',
    method: 'other',
    rooms: [{ type: 'deluxe', room: '203', adults: 2 }],
  },
  {
    id: 'early-departure',
    name: ['Elena', 'Paredes'],
    arrival: -1,
    nights: 1,
    status: 'checked_out',
    payment: 'credit',
    rooms: [{ type: 'standard', room: '107', adults: 1, discountCents: 2500 }],
  },
  {
    id: 'reused-room',
    name: ['Rodrigo', 'Soto'],
    arrival: 0,
    nights: 2,
    rooms: [{ type: 'standard', room: '107', adults: 2 }],
  },
  {
    id: 'split-departure',
    status: 'checked_in',
    name: ['Carolina', 'Huamán'],
    arrival: -1,
    nights: 3,
    payment: 'deposit',
    rooms: [
      {
        type: 'standard',
        room: '108',
        adults: 1,
        discountCents: 1000,
      },
      { type: 'standard', room: '109', adults: 2, discountCents: 3000 },
    ],
  },
  {
    id: 'discount',
    name: ['Ana', 'Gutiérrez'],
    arrival: 1,
    nights: 2,
    rooms: [{ type: 'standard', room: '104', adults: 1, fullDiscount: true }],
  },
  {
    id: 'installments',
    name: ['Luis', 'Pérez'],
    arrival: 0,
    nights: 3,
    status: 'checked_in',
    payment: 'installments',
    rooms: [{ type: 'deluxe', room: '204', adults: 2, discountCents: 5000 }],
  },
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
    'DELETE FROM reservation_requests;',
    'DELETE FROM reservation_events;',
    'DELETE FROM financial_entries;',
    'DELETE FROM reservation_guests;',
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
      statements.push(
        insert('room_type_rates', {
          id: `rate-${type}-${day}`,
          room_type_id: `type-${type}`,
          date: day,
          price_cents: price,
        }),
      )
    }
  }

  for (const [room, starts, ends, reason] of [
    ['110', -1, 3, 'Reparación del baño'],
    ['210', 4, 7, 'Mantenimiento del aire acondicionado'],
    ['310', 1, 4, 'Cambio de alfombra'],
  ]) {
    statements.push(
      insert('room_closures', {
        id: `closure-${room}`,
        room_id: `room-${room}`,
        starts: date(starts),
        ends: date(ends),
        reason,
        created_at: createdAt,
      }),
    )
  }

  for (const [index, example] of examples.entries()) {
    const guestId = `guest-${example.id}`
    const reservationId = `reservation-${example.id}`
    const checkIn = date(example.arrival)
    const checkOut = date(example.arrival + example.nights)
    statements.push(
      insert('guests', {
        id: guestId,
        full_name: example.name.join(' '),
        first_name: example.name[0],
        last_name: example.name[1],
        email: `${example.id}@example.com`,
        phone: `+51 9${String(index + 1).padStart(8, '0')}`,
        document_type: 'DNI',
        document_number: String(index + 1).padStart(8, '0'),
        notes: 'Huésped de prueba para la gestión del alojamiento.',
        created_at: createdAt,
      }),
    )
    statements.push(
      insert('reservations', {
        id: reservationId,
        code: `DEMO${String(index + 1).padStart(4, '0')}`,
        guest_id: guestId,
        check_in: checkIn,
        check_out: checkOut,
        status: example.status ?? 'confirmed',
        cancelled_at: example.status === 'cancelled' ? createdAt : null,
        actual_arrival: ['checked_in','checked_out'].includes(example.status) ? `${checkIn}T15:00:00.000Z` : null,
        actual_departure: example.status === 'checked_out' ? `${checkOut}T11:00:00.000Z` : null,
        source: 'desk',
        notes: 'Reserva de prueba. Restablecer con pnpm db:reset:local.',
        created_at: createdAt,
      }),
    )

    let total = 0
    let totalDiscount = 0
    for (const [lineIndex, room] of example.rooms.entries()) {
      const baseRate = baseRates.get(room.type)
      if (baseRate === undefined) throw new Error(`Missing type-${room.type} in seed.sql`)
      const lineId = `line-${example.id}-${lineIndex + 1}`
      const nights = Array.from({ length: example.nights }, (_, night) => {
        const day = date(example.arrival + night)
        return {
          date: day,
          price: room.flatRateCents ?? overrides.get(`${room.type}:${day}`) ?? baseRate,
        }
      })
      const subtotal = nights.reduce((sum, night) => sum + night.price, 0)
      const discount = room.fullDiscount ? subtotal : (room.discountCents ?? 0)
      if (!Number.isInteger(discount) || discount < 0) {
        throw new Error(`Invalid discount for ${lineId}`)
      }
      total += subtotal - discount
      totalDiscount += discount
      statements.push(
        insert('reservation_rooms', {
          id: lineId,
          reservation_id: reservationId,
          room_type_id: `type-${room.type}`,
          room_id: room.room ? `room-${room.room}` : null,
          adults: room.adults,
          children: room.children ?? 0,
          created_at: createdAt,
        }),
      )
      for (const { date: day, price } of nights) {
        statements.push(
          insert('reservation_room_nights', {
            id: `night-${lineId}-${day}`,
            reservation_room_id: lineId,
            date: day,
            price_cents: price,
          }),
        )
      }
    }

    statements.push(`UPDATE reservations SET discount_cents = ${totalDiscount} WHERE id = ${literal(reservationId)};`)
    if (example.payment) {
      if (example.payment === 'installments') {
        const third = Math.floor(total / 3)
        for (const [part, amount] of [third, third, total - third * 2].entries()) {
          statements.push(
            insert('payments', {
              id: `payment-${example.id}-${part + 1}`,
              reservation_id: reservationId,
              amount_cents: amount,
              method: ['cash', 'transfer', 'card'][part],
              reference: `DEMO-CUOTA-${part + 1}`,
              paid_at: `${date(example.arrival)}T${String(12 + part).padStart(2, '0')}:00:00.000Z`,
              notes: `Pago ${part + 1} de 3.`,
            }),
          )
        }
        continue
      }
      const amount =
        example.payment === 'full'
          ? total
          : example.payment === 'credit'
            ? total + 5000
            : Math.floor(total / 2)
      statements.push(
        insert('payments', {
          id: `payment-${example.id}`,
          reservation_id: reservationId,
          amount_cents: amount,
          method: example.method ?? (index % 2 === 0 ? 'card' : 'transfer'),
          reference: `DEMO-${example.id}`.toUpperCase(),
          paid_at: `${date(Math.min(0, example.arrival - 1))}T12:00:00.000Z`,
          notes:
            example.payment === 'credit'
              ? 'Pago con saldo a favor por salida anticipada.'
              : 'Pago de prueba.',
        }),
      )
    }
  }
  statements.push(`INSERT INTO financial_entries (id,reservation_id,kind,amount_cents,applied_cents,reason,method,occurred_at,payment_date,reference,created_at,legacy)
    SELECT id,reservation_id,'payment',amount_cents,0,notes,method,paid_at,substr(paid_at,1,10),reference,paid_at,0 FROM payments;`)
  // Keep the legacy table empty; financial_entries is the application's payment store.
  statements.push('DELETE FROM payments;')
  return statements.join('\n')
}
