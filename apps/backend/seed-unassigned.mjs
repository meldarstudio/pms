// Run against the local Worker with pnpm --filter @pms/backend db:seed:unassigned.
const base = process.env.PMS_API_URL ?? 'http://127.0.0.1:8788'

async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.statusText}`)
  return data
}

function date(offset) {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}

const types = await request('/room-types')
const existing = await request(`/reservations?q=Demo&from=${date(0)}&to=${date(10)}&limit=200`)
const examples = [
  { firstName: 'Alejandro', arrival: 0, nights: 1, types: ['type-standard'] },
  { firstName: 'Sofía', arrival: 1, nights: 3, types: ['type-deluxe'] },
  { firstName: 'Javier', arrival: 0, nights: 9, types: ['type-standard', 'type-suite'] },
]

for (const example of examples) {
  const checkIn = date(example.arrival)
  const checkOut = date(example.arrival + example.nights)
  const guestName = `${example.firstName} Demo`
  const found = existing.find(
    (reservation) => reservation.guestName === guestName && reservation.checkIn === checkIn && reservation.checkOut === checkOut,
  )
  if (found) {
    console.log(`${guestName}: ya existe, ${found.code}`)
    continue
  }
  const rooms = example.types.map((id) => {
    const type = types.find((item) => item.id === id)
    if (!type) throw new Error(`Falta el tipo ${id}. Ejecuta primero la carga local de habitaciones.`)
    return { roomTypeId: type.id, adults: 1, children: 0 }
  })
  const reservation = await request('/reservations', {
    guest: { firstName: example.firstName, lastName: 'Demo' },
    checkIn,
    checkOut,
    notes: 'Reserva de prueba para asignar habitaciones desde el calendario.',
    rooms,
  })
  console.log(`${guestName}: ${reservation.code}, ${checkIn} al ${checkOut}, ${rooms.length} ${rooms.length === 1 ? 'habitación sin asignar' : 'habitaciones sin asignar'}`)
}
