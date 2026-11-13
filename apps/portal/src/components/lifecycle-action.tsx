import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { useConfirmation } from "@/lib/use-confirmation";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

export type LifecycleStep = {
  status: "checked_in" | "checked_out";
  label: "Hacer check-in" | "Hacer check-out";
  due: boolean;
};

type UndoEntry = {
  id: string;
  status: ReservationDetail["status"];
  title: string;
  undo: () => void;
  forget: () => void;
};

function showUndo(entry: UndoEntry, disabled: boolean) {
  toast.success(entry.title, {
    id: entry.id,
    onDismiss: entry.forget,
    onAutoClose: entry.forget,
    action: (
      <button
        type="button"
        data-button
        data-action
        data-disabled={disabled}
        disabled={disabled}
        className="disabled:opacity-50"
        onClick={entry.undo}
      >
        Deshacer
      </button>
    ),
  });
}

export function lifecycleStep(detail: ReservationDetail, today: string): LifecycleStep | null {
  if (detail.status === "confirmed")
    return { status: "checked_in", label: "Hacer check-in", due: detail.checkIn <= today };
  if (detail.status === "checked_in")
    return { status: "checked_out", label: "Hacer check-out", due: detail.checkOut <= today };
  return null;
}

export function useLifecycleAction(detail: ReservationDetail, blocked = false) {
  const { today } = usePropertyCalendar();
  const step = lifecycleStep(detail, today);
  const { send, saving } = useReservationCommands(detail.id);
  const [phase, setPhase] = useState<"idle" | "confirming" | "saving">("idle");
  const operation = useRef(phase);
  function transition(next: typeof phase) {
    operation.current = next;
    setPhase(next);
  }
  const running = phase === "saving";
  const [confirmCheckIn, checkInDialog] = useDirtyRoomCheckIn();
  const { value: owed, request: requestBalance, close: closeBalance } = useConfirmation<number>();
  const eligible = !blocked && !saving && !running;
  const current = useRef({ status: detail.status, eligible });
  useLayoutEffect(() => {
    current.current = { status: detail.status, eligible };
  }, [detail.status, eligible]);
  const undo = useRef<UndoEntry | null>(null);
  function dismissUndo() {
    if (!undo.current) return;
    const { id } = undo.current;
    undo.current = null;
    toast.dismiss(id);
  }
  useEffect(() => {
    if (undo.current && undo.current.status !== detail.status) dismissUndo();
    else if (undo.current) showUndo(undo.current, !eligible);
  }, [detail.status, eligible]);
  useEffect(() => dismissUndo, []);

  function confirmBalance() {
    if (detail.balanceCents <= 0) return Promise.resolve(true);
    return requestBalance(detail.balanceCents);
  }

  async function run() {
    if (!step || !current.current.eligible || operation.current !== "idle") return;
    transition("confirming");
    try {
      const previous = detail.status === "checked_in" ? "checked_in" : "confirmed";
      const proceed =
        step.status === "checked_in"
          ? await confirmCheckIn(detail, step.status)
          : await confirmBalance();
      if (!proceed || !current.current.eligible || current.current.status !== previous) return;
      transition("saving");
      const result = await send([{ type: "set-status", status: step.status }]);

      if (result.status !== "saved")
        return toastError("No se pudo cambiar el estado", unsavedMessage(result));
      const checkIn = step.status === "checked_in";
      dismissUndo();
      const entry: UndoEntry = {
        id: crypto.randomUUID(),
        status: step.status,
        title: checkIn ? "Check-in registrado" : "Check-out registrado",
        undo: async () => {
          if (
            undo.current !== entry ||
            current.current.status !== entry.status ||
            !current.current.eligible
          )
            return;
          dismissUndo();
          const undone = await send([{ type: "set-status", status: previous }]);
          if (undone.status === "saved")
            toast.success(checkIn ? "Check-in deshecho" : "Check-out deshecho");
          else toastError("No se pudo deshacer", unsavedMessage(undone));
        },
        forget: () => {
          if (undo.current === entry) undo.current = null;
        },
      };
      undo.current = entry;
      showUndo(entry, !current.current.eligible);
    } finally {
      transition("idle");
    }
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
