import { OutcomeCommandPreview, outcomeSaveError } from "@/components/outcome-command-preview";
import { Button } from "@/components/ui/button";
import type { ReservationDetail, WorkflowAction } from "@/lib/api";
import { useReservationPreview, type ReservationCommandResult } from "@/lib/reservation-commands";
import { submitForm } from "@/lib/reservation-form";
import { toast } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

export function RestoreReservationForm({
  detail,
  disabled,
  onSave,
  onDone,
  onCancel,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { today } = usePropertyCalendar();
  const actions: WorkflowAction[] = [{ type: "set-status", status: "confirmed" }];
  const blocked =
    detail.refunds.length > 0 || detail.coupons.length > 0 || detail.couponMovements.length > 0;
  const preview = useReservationPreview(detail.id, actions, !blocked, today);
  const ready =
    !blocked && preview.isSuccess && !preview.isFetching && !preview.data.validation.issues.length;
  async function save() {
    if (disabled || !ready) return;
    const result = await onSave(actions);
    if (result.status === "saved") {
      toast.add({ title: "Cambios guardados", type: "success" });
      onDone();
    } else if (result.status === "failed") outcomeSaveError(result);
  }
  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
      onSubmit={(event) => void submitForm(event, save)}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-px">
        {blocked ? (
          <p>Tiene reembolsos o cupones. Crea una nueva reserva.</p>
        ) : (
          <OutcomeCommandPreview preview={preview} detail={detail} today={today} />
        )}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>
          Cerrar
        </Button>
        <Button type="submit" disabled={disabled || !ready}>
          {disabled ? "Guardando…" : "Restaurar reserva"}
        </Button>
      </div>
    </form>
  );
}
