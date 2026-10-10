import { format as formatDate } from "date-fns"
import { es } from "date-fns/locale"

export function format(date: Date | number | string, pattern: string) {
  return formatDate(date, pattern, { locale: es })
}
