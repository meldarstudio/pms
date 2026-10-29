import { useEffect, useRef } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  assignmentTitle,
  RoomAssignmentSteps,
  type RoomAssignmentStepsProps,
} from "@/components/room-assignment-flow";

export function RoomAssignmentPanel({
  rangeLabel,
  onClose,
  ...steps
}: RoomAssignmentStepsProps & { rangeLabel: string; onClose: () => void }) {
  const { target, pending } = steps.assignment;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [target?.id]);

  return (
    <section
      id="unassigned-panel"
      aria-labelledby="unassigned-heading"
      className="flex h-full min-h-0 flex-col bg-muted text-xs"
    >
      <div className="flex items-start gap-2 border-b p-3">
        {target && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Volver a habitaciones reservadas sin asignar"
            disabled={pending}
            onClick={steps.assignment.cancel}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2
            id="unassigned-heading"
            ref={heading}
            tabIndex={-1}
            className="font-medium outline-none"
          >
            {assignmentTitle(target, steps.loading, steps.stays.length)}
          </h2>
          <p className="text-muted-foreground">
            {target
              ? "Elige una habitación de la lista o su barra punteada en el calendario."
              : `Estancias entre ${rangeLabel}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Cerrar habitaciones reservadas sin asignar"
          disabled={pending}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <RoomAssignmentSteps {...steps} />
      </div>
    </section>
  );
}
