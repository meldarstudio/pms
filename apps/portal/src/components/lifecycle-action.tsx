import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDirtyRoomCheckIn } from "@/components/dirty-room-check-in";
import type { ReservationDetail } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { unsavedMessage, useReservationCommands } from "@/lib/reservation-commands";
import { toast, toastError } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

export type LifecycleStep = {
  status: "checked_in" | "checked_out";
  label: "Hacer check-in" | "Hacer check-out";
  due: boolean;
};

const undoTimeout = 8000;

export function lifecycleStep(detail: ReservationDetail, today: string): LifecycleStep | null {
  if (detail.status === "confirmed")
    return { status: "checked_in", label: "Hacer check-in", due: detail.checkIn <= today };
  if (detail.status === "checked_in")
    return { status: "checked_out", label: "Hacer check-out", due: detail.checkOut <= today };
  return null;
}

export function useLifecycleAction(detail: ReservationDetail) {
  const { today } = usePropertyCalendar();
  const step = lifecycleStep(detail, today);
  const { send, saving } = useReservationCommands(detail.id);
  const [running, setRunning] = useState(false);
  const [confirmCheckIn, checkInDialog] = useDirtyRoomCheckIn();
  const [owed, setOwed] = useState<number | null>(null);
  const settleOwed = useRef<((proceed: boolean) => void) | null>(null);

  function confirmBalance() {
    if (detail.balanceCents <= 0) return Promise.resolve(true);
    settleOwed.current?.(false);
    return new Promise<boolean>((resolve) => {
      settleOwed.current = resolve;
      setOwed(detail.balanceCents);
    });
  }

  function closeBalance(proceed: boolean) {
    settleOwed.current?.(proceed);
    settleOwed.current = null;
    setOwed(null);
  }

  async function run() {
    if (!step || running || saving) return;
    const previous = detail.status === "checked_in" ? "checked_in" : "confirmed";
    const proceed =
      step.status === "checked_in"
        ? await confirmCheckIn(detail, step.status)
        : await confirmBalance();
    if (!proceed) return;
    setRunning(true);
    const result = await send([{ type: "set-status", status: step.status }]);
    setRunning(false);
    if (result.status !== "saved")
      return toastError("No se pudo cambiar el estado", unsavedMessage(result));
    const checkIn = step.status === "checked_in";
    const id = toast.add({
      title: checkIn ? "Check-in registrado" : "Check-out registrado",
      type: "success",
      timeout: undoTimeout,
      actionProps: {
        children: "Deshacer",
        onClick: async () => {
          toast.close(id);
          const undone = await send([{ type: "set-status", status: previous }]);
          if (undone.status === "saved")
            toast.add({
              title: checkIn ? "Check-in deshecho" : "Check-out deshecho",
              type: "success",
            });
          else toastError("No se pudo deshacer", unsavedMessage(undone));
        },
      },
    });
  }

  const dialogs = (
    <>
      {checkInDialog}
      <CheckOutBalanceConfirmation
        balanceCents={owed}
        currency={detail.currency}
        onBack={() => closeBalance(false)}
        onConfirm={() => closeBalance(true)}
      />
    </>
  );

  return { step, run, running, dialogs };
}

export function CheckOutBalanceConfirmation({
  balanceCents,
  currency,
  onBack,
  onConfirm,
}: {
  balanceCents: number | null;
  currency: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={balanceCents !== null}
      onOpenChange={(open) => {
        if (!open) onBack();
      }}
    >
      <AlertDialogContent className="flex max-h-[90dvh] flex-col overflow-hidden">
        <AlertDialogHeader className="min-h-0 overflow-y-auto">
          <AlertDialogTitle>Hacer check-out</AlertDialogTitle>
          <AlertDialogDescription>
            Quedan {formatMoney(balanceCents ?? 0, currency)} por pagar. ¿Hacer check-out de todos
            modos?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="shrink-0">
          <Button variant="outline" onClick={onBack}>
            Volver
          </Button>
          <Button onClick={onConfirm}>Hacer check-out</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
