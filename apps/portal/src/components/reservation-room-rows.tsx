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
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h4 id={titleId} className="text-xs font-medium text-muted-foreground">
          Habitación {index + 1}
        </h4>
        {(actions || count > 1) && (
          <div className="flex items-center gap-1">
            {actions}
            {count > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={`Quitar habitación ${index + 1}`}
                onClick={onRemove}
              >
                <Trash2Icon data-icon="inline-start" />
                Quitar
              </Button>
            )}
          </div>
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
