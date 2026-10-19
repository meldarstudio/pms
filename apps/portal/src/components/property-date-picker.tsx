import { TZDate, type Matcher } from "react-day-picker";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { dateOnlyCarrier } from "@/lib/property-calendar";
import { addDateLabelDays } from "@/lib/dates";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

// Callers use Date only as a carrier of year/month/day components. The picker
// uses zoned Dates internally; never convert a carrier as though it were an instant.
export function PropertyDatePicker({
  selected,
  defaultMonth,
  disabled,
  onSelect,
}: {
  mode?: "single";
  selected?: Date;
  defaultMonth?: Date;
  disabled?: Matcher | Matcher[];
  onSelect: (date: Date | undefined) => void;
}) {
  const { timeZone, today } = usePropertyCalendar();
  const carrierTimeZone =
    selected instanceof TZDate && selected.timeZone === "UTC" ? "UTC" : undefined;
  const zoned = (date: Date) => {
    const label = format(date, "yyyy-MM-dd");
    const result = new TZDate(date.getFullYear(), date.getMonth(), date.getDate(), timeZone);
    if (format(result, "yyyy-MM-dd") === label) return result;
    // Its numeric constructor also goes through the browser's native Date.
    // Bypass that path when a browser-only skipped date changed the label.
    const utc = Date.parse(`${label}T00:00:00Z`);
    const offset = new TZDate(utc, timeZone).getTimezoneOffset();
    return new TZDate(utc + offset * 60_000, timeZone);
  };
  // Preserve the caller's carrier zone, including UTC labels for browser-skipped days.
  const carrier = (date: Date) => dateOnlyCarrier(format(date, "yyyy-MM-dd"), carrierTimeZone);
  const matcher = (value: Matcher): Matcher => {
    if (value instanceof Date) return zoned(value);
    if (Array.isArray(value)) return value.map(zoned);
    if (typeof value === "function") return (date) => value(carrier(date));
    if (typeof value !== "object") return value;
    if ("before" in value && "after" in value)
      return { before: zoned(value.before), after: zoned(value.after) };
    if ("before" in value) return { before: zoned(value.before) };
    if ("after" in value) return { after: zoned(value.after) };
    if ("from" in value)
      return { from: value.from && zoned(value.from), to: value.to && zoned(value.to) };
    return value;
  };
  const current = zoned(dateOnlyCarrier(today, carrierTimeZone));
  return (
    <Calendar
      mode="single"
      timeZone={timeZone}
      // TZDate's local setters can still skip a browser-only missing day.
      // Keep stepping and day identity on calendar labels, not those setters.
      dateLib={
        carrierTimeZone === "UTC"
          ? {
              addDays: (date, amount) =>
                zoned(dateOnlyCarrier(addDateLabelDays(format(date, "yyyy-MM-dd"), amount), "UTC")),
              startOfDay: zoned,
              isSameDay: (left, right) =>
                format(left, "yyyy-MM-dd") === format(right, "yyyy-MM-dd"),
            }
          : undefined
      }
      today={current}
      selected={selected && zoned(selected)}
      defaultMonth={defaultMonth ? zoned(defaultMonth) : selected ? zoned(selected) : current}
      disabled={
        Array.isArray(disabled)
          ? disabled.map(matcher)
          : disabled === undefined
            ? undefined
            : matcher(disabled)
      }
      onSelect={(date) => onSelect(date && carrier(date))}
    />
  );
}
