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

export const primaryActionClearance = "max-md:pb-(--primary-action-clearance)";

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
      size="icon"
      className={cn(
        "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 w-auto gap-0 shadow-lg",
        className,
      )}
      {...props}
    >
      <span className="flex h-full aspect-square shrink-0 items-center justify-center">{icon}</span>
      <span
        className={cn(
          "grid transition-[grid-template-columns,opacity] duration-300 ease-out motion-reduce:transition-none",
          collapsed ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100",
        )}
      >
        <span className="min-w-0 overflow-hidden">
          <span className="block pr-2.5">{label}</span>
        </span>
      </span>
    </Button>,
    container,
  );
}
