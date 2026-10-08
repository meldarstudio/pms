// Run against the local Worker with pnpm --filter @pms/backend db:seed:unassigned.
const base = process.env.PMS_API_URL ?? 'http://127.0.0.1:8787'

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
  value.setDate(value.getDate() + offset)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

const types = await request('/room-types')
const existing = await request(`/reservations?q=Demo&from=${date(0)}&to=${date(1)}&limit=200`)
const examples = [
  { firstName: 'Alex', arrival: 0, nights: 1, types: ['Standard'] },
  { firstName: 'Sam', arrival: 1, nights: 3, types: ['Deluxe'] },
  { firstName: 'Jamie', arrival: 0, nights: 9, types: ['Standard', 'Suite'] },
]

for (const example of examples) {
  const checkIn = date(example.arrival)
  const checkOut = date(example.arrival + example.nights)
  const guestName = `${example.firstName} Demo`
  const found = existing.find(
    (reservation) => reservation.guestName === guestName && reservation.checkIn === checkIn && reservation.checkOut === checkOut,
  )
  if (found) {
    console.log(`${guestName}: already exists, ${found.code}`)
    continue
  }
  const rooms = example.types.map((name) => {
    const type = types.find((item) => item.name === name)
    if (!type) throw new Error(`Missing room type ${name}. Run the local room seed first.`)
    return { roomTypeId: type.id, adults: 1, children: 0 }
  })
  const reservation = await request('/reservations', {
    guest: { firstName: example.firstName, lastName: 'Demo' },
    checkIn,
    checkOut,
    notes: 'Sample reservation for testing manual calendar assignment.',
    rooms,
  })
  console.log(`${guestName}: ${reservation.code}, ${checkIn} to ${checkOut}, ${rooms.length} unassigned ${rooms.length === 1 ? 'room' : 'rooms'}`)
}
