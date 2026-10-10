const inactive = new Set(['cancelled', 'no_show', 'checked_out'])

export type GridStay = {
  roomTypeId: string
  status: string
  checkIn: string
  checkOut: string
}

export type GridClosure = {
  roomId: string
  roomTypeId: string
  starts: string
  ends: string
}

export type GridRate = {
  roomTypeId: string
  date: string
  priceCents: number
}

export type GridRoomType = {
  id: string
  name: string
  maxOccupancy: number
  baseRateCents: number
}

function occupies(start: string, end: string, date: string) {
  return start <= date && end > date
}

function nightLoad(date: string, stays: GridStay[], closures: GridClosure[]) {
  const booked = stays.filter((stay) => occupies(stay.checkIn, stay.checkOut, date)).length
  const closed = new Set(
    closures.filter((closure) => occupies(closure.starts, closure.ends, date)).map((closure) => closure.roomId),
  ).size
  return { booked, closed }
}

export function peakOccupied(dates: string[], stays: GridStay[], closures: GridClosure[]) {
  const active = stays.filter((stay) => !inactive.has(stay.status))
  const peaks = new Map<string, number>()
  const typeIds = new Set([
    ...active.map((stay) => stay.roomTypeId),
    ...closures.map((closure) => closure.roomTypeId),
  ])
  for (const typeId of typeIds) {
    const typeStays = active.filter((stay) => stay.roomTypeId === typeId)
    const typeClosures = closures.filter((closure) => closure.roomTypeId === typeId)
    let peak = 0
    for (const date of dates) {
      const { booked, closed } = nightLoad(date, typeStays, typeClosures)
      peak = Math.max(peak, booked + closed)
    }
    peaks.set(typeId, peak)
  }
  return peaks
}

export function inventoryGrid(
  dates: string[],
  types: GridRoomType[],
  capacity: ReadonlyMap<string, number>,
  stays: GridStay[],
  closures: GridClosure[],
  rates: GridRate[],
) {
  const active = stays.filter((stay) => !inactive.has(stay.status))
  const priceByType = new Map<string, Map<string, number>>()
  for (const rate of rates) {
    const byDate = priceByType.get(rate.roomTypeId) ?? new Map<string, number>()
    byDate.set(rate.date, rate.priceCents)
    priceByType.set(rate.roomTypeId, byDate)
  }

  return types
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((type) => {
      const rooms = capacity.get(type.id) ?? 0
      const typeStays = active.filter((stay) => stay.roomTypeId === type.id)
      const typeClosures = closures.filter((closure) => closure.roomTypeId === type.id)
      const overrides = priceByType.get(type.id)
      return {
        id: type.id,
        name: type.name,
        maxOccupancy: type.maxOccupancy,
        baseRateCents: type.baseRateCents,
        capacity: rooms,
        nights: dates.map((date) => {
          const { booked, closed } = nightLoad(date, typeStays, typeClosures)
          const override = overrides?.get(date)
          return {
            date,
            booked,
            closed,
            free: Math.max(0, rooms - booked - closed),
            priceCents: override ?? type.baseRateCents,
            override: override !== undefined,
          }
        }),
      }
    })
}
