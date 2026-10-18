import { useSyncExternalStore } from "react";
import { nextPropertyDay, propertyTimeZone, propertyToday } from "./property-calendar";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function refresh() {
  clearTimeout(timer);
  for (const notify of listeners) notify();
  timer = setTimeout(refresh, Math.max(1, nextPropertyDay() - Date.now()));
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  if (listeners.size === 1) {
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
  }
  return () => {
    listeners.delete(notify);
    if (!listeners.size) {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    }
  };
}

// All date-relative UI re-renders at the boundary and on resume. Defaults stay
// in their owning form state: a new day never overwrites a draft or a URL.
export function usePropertyCalendar() {
  const today = useSyncExternalStore(subscribe, propertyToday);
  return { today, timeZone: propertyTimeZone() };
}
