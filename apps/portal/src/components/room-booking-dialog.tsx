import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  wideDialogContent,
} from "@/components/ui/dialog";
import { DiscardChanges } from "@/components/discard-changes";
import { NewBooking } from "@/components/new-booking";
import { toast } from "@/lib/toast";

export type BookingTarget =
  | {
      mode: "create";
      roomId: string;
      roomTypeId: string;
      number: string;
      typeName: string;
      checkIn: string;
    }
  | { mode: "new" };

export function RoomBookingDialog({
  target,
  onClose,
  onCreated,
}: {
  target: BookingTarget | null;
  onClose: () => void;
  onCreated: (reservationId: string) => void;
}) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const open = target !== null;
  const dirty = useRef(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const resize = () => {
      popup.current?.style.setProperty("--reservation-viewport-height", `${viewport.height}px`);
      popup.current?.style.setProperty("--reservation-viewport-top", `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [open]);
  useEffect(() => {
    const protectUnload = (event: BeforeUnloadEvent) => {
      if (!target || (!creating && !dirty.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => window.removeEventListener("beforeunload", protectUnload);
  }, [creating, target]);
  function close() {
    if (creating) return;
    if (dirty.current) setLeave(() => onClose);
    else onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={popup}
        closeDisabled={creating}
        showCloseButton={false}
        className={cn(
          "max-h-[94svh] overflow-y-auto max-md:top-(--reservation-viewport-top,0px) max-md:left-0 max-md:flex max-md:h-(--reservation-viewport-height,100dvh) max-md:max-h-(--reservation-viewport-height,100dvh) max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:flex-col max-md:gap-0 max-md:overflow-hidden max-md:p-0 max-md:transition-none",
          wideDialogContent,
        )}
      >
        <DialogHeader className="shrink-0 max-md:py-4 max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:safe-area-padding-x">
          <div className="flex flex-wrap items-center gap-3 pr-8">
            <DialogTitle>Nueva reserva</DialogTitle>
          </div>
          <DialogDescription>Completa la estancia y el contacto principal.</DialogDescription>
          <DialogClose
            disabled={creating}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2 max-md:top-[max(0.5rem,env(safe-area-inset-top))] max-md:right-[max(0.5rem,env(safe-area-inset-right))]"
              />
            }
          >
            <XIcon data-icon="inline-start" />
            <span className="sr-only">Cerrar</span>
          </DialogClose>
        </DialogHeader>
        {target && (
          <NewBooking
            key={target.mode === "create" ? target.roomId + target.checkIn : "new"}
            target={target}
            onCreated={(reservation) => {
              toast.add({ title: "Reserva creada", type: "success" });
              client.setQueryData(["reservation", reservation.id], reservation);
              dirty.current = false;
              onCreated(reservation.id);
            }}
            onCancel={close}
            onDirtyChange={onDirtyChange}
            onSavingChange={setCreating}
          />
        )}
      </DialogContent>
      {leave && (
        <DiscardChanges
          onStay={() => setLeave(null)}
          onLeave={() => {
            if (creating) return;
            dirty.current = false;
            setLeave(null);
            leave();
          }}
        />
      )}
    </Dialog>
  );
}
