import { useEffect, useRef, type RefObject } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  assignmentTitle,
  RoomAssignmentSteps,
  type RoomAssignmentStepsProps,
} from "@/components/room-assignment-flow";

export function RoomAssignmentSheet({
  open,
  onOpenChange,
  returnFocusRef,
  rangeLabel,
  ...steps
}: RoomAssignmentStepsProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  rangeLabel: string;
}) {
  const { assignment } = steps;
  const { target, pending } = assignment;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, target?.id]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        if (pending) {
          details.cancel();
          return;
        }
        if (!next && target && details.reason === "escape-key") {
          details.cancel();
          assignment.cancel();
          return;
        }
        if (!next) assignment.cancel();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        initialFocus={heading}
        finalFocus={returnFocusRef}
        className="max-h-[85dvh] overflow-hidden pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="shrink-0 border-b">
          <div className="flex items-center gap-2">
            {target && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Volver a habitaciones reservadas sin asignar"
                disabled={pending}
                onClick={assignment.cancel}
              >
                <ArrowLeftIcon />
              </Button>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle ref={heading} tabIndex={-1}>
                {assignmentTitle(target, steps.loading, steps.stays.length)}
              </SheetTitle>
              <SheetDescription>
                {target
                  ? "Toca una habitación disponible para asignarla a toda la estancia."
                  : `Estancias entre ${rangeLabel}`}
              </SheetDescription>
            </div>
            <SheetClose
              render={<Button variant="ghost" size="icon-sm" disabled={pending} />}
              aria-label="Cerrar habitaciones reservadas sin asignar"
            >
              <XIcon />
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <RoomAssignmentSteps {...steps} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
