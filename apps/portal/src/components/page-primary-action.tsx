import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

export const PagePrimaryActionContext = createContext<HTMLDivElement | null>(null);

/** Bottom padding for a page scroller so its last content can scroll clear of the action. */
export const primaryActionClearance = "max-md:pb-(--primary-action-clearance)";

/**
 * The page's main task as a floating mobile button, reachable one-handed. It shows its
 * label at the top of `scrollRef` and collapses to the icon once the page scrolls.
 * Pages own their desktop placement.
 */
export function PagePrimaryAction({
  icon,
  label,
  scrollRef,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  icon: ReactNode;
  label: string;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const container = useContext(PagePrimaryActionContext);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const scroller = scrollRef.current;
      scroller?.addEventListener("scroll", onChange, { passive: true });
      return () => scroller?.removeEventListener("scroll", onChange);
    },
    [scrollRef],
  );
  const collapsed = useSyncExternalStore(
    subscribe,
    () => (scrollRef.current?.scrollTop ?? 0) > 8,
    () => false,
  );

  if (!container) return null;
  return createPortal(
    <Button
      data-collapsed={collapsed || undefined}
      className={cn(
        "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-12 gap-0 px-3.5 text-sm shadow-lg [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      {...props}
    >
      {icon}
      {/* Animating 0fr ↔ 1fr eases the label in at its natural width; it stays readable to
          assistive technology while collapsed. */}
      <span
        className={cn(
          "grid transition-[grid-template-columns,opacity] duration-300 ease-out motion-reduce:transition-none",
          collapsed ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100",
        )}
      >
        <span className="min-w-0 overflow-hidden">
          <span className="block pr-0.5 pl-2">{label}</span>
        </span>
      </span>
    </Button>,
    container,
  );
}
