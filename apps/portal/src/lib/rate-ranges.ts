function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function datesBetween(dates: string[], from: string, to: string) {
  const start = from < to ? from : to
  const end = from < to ? to : from
  return dates.filter((date) => date >= start && date <= end)
}

export function contiguousRanges(dates: string[]) {
  const ranges: { from: string; to: string }[] = []
  for (const date of [...dates].sort()) {
    const last = ranges.at(-1)
    if (!last || nextDate(last.to) !== date)
      ranges.push({ from: date, to: date })
    else last.to = date
  }
  return ranges
}
