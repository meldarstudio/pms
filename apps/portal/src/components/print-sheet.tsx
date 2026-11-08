import { useEffect, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { propertyTimeZone } from "@/lib/property-calendar";

export function propertyTime(instant: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: propertyTimeZone(),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

export function longPropertyDate(date: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function useStampedAtPrint() {
  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintedAt(new Date()));
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);
  return printedAt;
}

export function PrintSheet({ children }: { children: ReactNode }) {
  return createPortal(
    <section
      data-print-sheet
      className="hidden bg-background p-2 text-foreground [print-color-adjust:exact] print:block"
    >
      {children}
    </section>,
    document.body,
  );
}
