import { useId, type ReactNode } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export function ReservationRoomRow({
  index,
  count,
  onRemove,
  actions,
  typeField,
  roomField,
  adultsField,
  childrenField,
  feedback,
}: {
  index: number;
  count: number;
  onRemove: () => void;
  actions?: ReactNode;
  typeField: ReactNode;
  roomField: ReactNode;
  adultsField: ReactNode;
  childrenField: ReactNode;
  feedback?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
      <div className="grid min-h-6 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:flex">
        <h4 id={titleId} className="text-xs font-medium text-muted-foreground md:flex-1">
          Habitación {index + 1}
        </h4>
        {actions && <div className="col-span-full row-start-2 min-w-0">{actions}</div>}
        {count > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="col-start-2 row-start-1"
            aria-label={`Quitar habitación ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2Icon data-icon="inline-start" />
            Quitar
          </Button>
        )}
      </div>
      <FieldGroup className="grid grid-cols-3 gap-3 md:grid-cols-[minmax(0,1fr)_7rem_4rem_4rem]">
        <div className="col-span-full min-w-0 md:col-span-1">{typeField}</div>
        <div className="min-w-0">{roomField}</div>
        <div className="min-w-0">{adultsField}</div>
        <div className="min-w-0">{childrenField}</div>
        {feedback && <div className="col-span-full flex flex-col gap-1">{feedback}</div>}
      </FieldGroup>
    </section>
  );
}
