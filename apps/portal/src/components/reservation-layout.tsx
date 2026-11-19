import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useIsTablet } from "@/hooks/use-mobile";

const MIN_COLUMNS_CONTENT_WIDTH = 1000;

const ReservationLayoutContext = createContext({ stacked: false, tablet: false });

export function useReservationLayout() {
  return useContext(ReservationLayoutContext);
}

export function ReservationLayout({ children }: { children: ReactNode }) {
  const tablet = useIsTablet();
  const container = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width > 0)
        setContentWidth(box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      element.style.setProperty("--reservation-content-left", `${box.left}px`);
      element.style.setProperty("--reservation-content-width", `${box.width}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const stacked = (contentWidth ?? window.innerWidth) < MIN_COLUMNS_CONTENT_WIDTH;
  return (
    <ReservationLayoutContext value={{ stacked, tablet }}>
      <div
        ref={container}
        data-layout={stacked ? "stacked" : "columns"}
        data-tablet={tablet || undefined}
        className="group/reservation flex w-full flex-col gap-4 p-4 lg:p-6"
      >
        {children}
      </div>
    </ReservationLayoutContext>
  );
}
