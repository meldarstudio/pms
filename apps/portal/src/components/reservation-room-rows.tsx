import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { RoomActionsMenu } from "@/components/room-actions-menu";
import { FieldGroup } from "@/components/ui/field";

export type RoomRowPrice = {
  open: boolean;
  onOpen: () => void;
  field: (onUndo: () => void) => ReactNode;
};

export function ReservationRoomRow({
  index,
  count,
  onRemove,
  price,
  stacked = false,
  typeField,
  roomField,
  adultsField,
  childrenField,
  feedback,
  reveal = false,
}: {
  index: number;
  count: number;
  onRemove: () => void;
  price?: RoomRowPrice | null;
  stacked?: boolean;
  typeField: ReactNode;
  roomField: ReactNode;
  adultsField: ReactNode;
  childrenField: ReactNode;
  feedback?: ReactNode;
  reveal?: boolean;
}) {
  const titleId = useId();
  const [menu, setMenu] = useState<HTMLButtonElement | null>(null);
  const priceSlot = useRef<HTMLDivElement>(null);
  const [revealing, setRevealing] = useState(reveal);
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex min-w-0 flex-col gap-2",
        revealing &&
          "transition-opacity duration-160 ease-ui-out starting:opacity-0 motion-reduce:duration-120",
      )}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity")
          setRevealing(false);
      }}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h4 id={titleId} className="text-xs font-medium text-muted-foreground">
          Habitación {index + 1}
        </h4>
        <RoomActionsMenu
          index={index}
          size={stacked ? "icon" : "icon-sm"}
          triggerRef={setMenu}
          onReprice={
            price && !price.open
              ? () => {
                  price.onOpen();
                  requestAnimationFrame(() => priceSlot.current?.querySelector("input")?.focus());
                }
              : undefined
          }
          onRemove={count > 1 ? onRemove : undefined}
        />
      </div>
      <FieldGroup
        className={cn(
          "grid gap-3",
          stacked
            ? "grid-cols-2"
            : "grid-cols-3 max-md:pointer-coarse:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_7rem_4rem_4rem] md:pointer-coarse:grid-cols-[minmax(0,1fr)_9rem_5rem_5rem]",
        )}
      >
        <div className={cn("col-span-full min-w-0", !stacked && "md:col-span-1")}>{typeField}</div>
        <div className={cn("min-w-0", stacked && "col-span-full")}>{roomField}</div>
        <div className="min-w-0">{adultsField}</div>
        <div className="min-w-0">{childrenField}</div>
        {feedback && <div className="col-span-full flex flex-col gap-1">{feedback}</div>}
      </FieldGroup>
      {price?.open && (
        <div ref={priceSlot} className="min-w-0">
          {price.field(() => requestAnimationFrame(() => menu?.focus()))}
        </div>
      )}
    </section>
  );
}
