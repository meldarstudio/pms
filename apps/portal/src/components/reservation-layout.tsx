import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useIsMobile, useIsTablet, useMediaQuery } from "@/hooks/use-mobile";

const ReservationLayoutContext = createContext({ stacked: false, tablet: false });

export function useReservationLayout() {
  return useContext(ReservationLayoutContext);
}

export function ReservationLayout({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  const tablet = useIsTablet();
  const portrait = useMediaQuery("(orientation: portrait)");
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width > 0)
        setWidth(box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      element.style.setProperty("--reservation-content-left", `${box.left}px`);
      element.style.setProperty("--reservation-content-width", `${box.width}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const stacked = mobile || (tablet && (portrait || (width ?? window.innerWidth) < 960));
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
