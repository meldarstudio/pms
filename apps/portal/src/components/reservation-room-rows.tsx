import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { RoomActionsMenu } from "@/components/room-actions-menu";
import { FieldGroup } from "@/components/ui/field";

export function ReservationRoomRow({
  index,
  count,
  onRemove,
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
  typeField: ReactNode;
  roomField: ReactNode;
  adultsField: ReactNode;
  childrenField: ReactNode;
  feedback?: ReactNode;
  reveal?: boolean;
}) {
  const titleId = useId();
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
        <RoomActionsMenu index={index} size="icon-sm" onRemove={count > 1 ? onRemove : undefined} />
      </div>
      <FieldGroup className="grid grid-cols-3 gap-3 max-xl:pointer-coarse:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_7rem_4rem_4rem]">
        <div className="col-span-full min-w-0 xl:col-span-1">{typeField}</div>
        <div className="min-w-0">{roomField}</div>
        <div className="min-w-0">{adultsField}</div>
        <div className="min-w-0">{childrenField}</div>
        {feedback && <div className="col-span-full flex flex-col gap-1">{feedback}</div>}
      </FieldGroup>
    </section>
  );
}
