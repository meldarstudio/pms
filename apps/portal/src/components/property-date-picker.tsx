import { TZDate, type Matcher } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { dateOnlyCarrier } from "@/lib/property-calendar";
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
  const zoned = (date: Date) =>
    new TZDate(date.getFullYear(), date.getMonth(), date.getDate(), timeZone);
  const carrier = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
  const current = zoned(dateOnlyCarrier(today));
  return (
    <Calendar
      mode="single"
      timeZone={timeZone}
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
