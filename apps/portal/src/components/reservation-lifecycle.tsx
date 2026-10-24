import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDirtyRoomCheckIn } from "@/components/dirty-room-check-in";
import { FieldGroup } from "@/components/ui/field";
import { ChoiceField } from "@/components/workflow-fields";
import type { ReservationDetail, WorkflowAction } from "@/lib/api";
import { useReservationSaving, useWorkflowCommand } from "@/lib/queries";
import { isReservationSaving } from "@/lib/workflow-query-cache";
import { createWorkflowSaver } from "@/lib/workflow-save";
import { reservationStatusLabel } from "@/lib/reservation-list";
import { toast, toastError } from "@/lib/toast";

type Status = Extract<WorkflowAction, { type: "set-status" }>["status"];
const statuses = ["confirmed", "checked_in", "checked_out", "cancelled"] as const;
const options = statuses.map((value) => ({ value, label: reservationStatusLabel(value) }));

export function ReservationLifecycle({
  detail,
  blocked = false,
  onConfirm,
}: {
  detail: ReservationDetail;
  blocked?: boolean;
  onConfirm: (status: Status) => void;
}) {
  const client = useQueryClient();
  const mutation = useWorkflowCommand(detail.id);
  const saving = useReservationSaving(detail.id);
  const [save] = useState(createWorkflowSaver);
  const pending = useRef(false);
  const [confirmCheckIn, checkInDialog] = useDirtyRoomCheckIn();
  async function change(status: Status) {
    if (
      status === detail.status ||
      blocked ||
      pending.current ||
      isReservationSaving(client, detail.id)
    )
      return;
    pending.current = true;
    try {
      if (!(await confirmCheckIn(detail, status))) return;
      if (status === "cancelled" || detail.status === "cancelled") {
        onConfirm(status);
        return;
      }
      await save([{ type: "set-status", status }], (command) =>
        mutation.mutateAsync({ id: detail.id, command }),
      );
      toast.add({ title: "Estado guardado", type: "success" });
    } catch (cause) {
      toastError("No se pudo cambiar el estado", cause);
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="flex flex-col items-end gap-2">
      {checkInDialog}
      <FieldGroup className="w-44" aria-busy={saving}>
        <ChoiceField
          label="Estado de la reserva"
          hideLabel
          value={detail.status}
          options={options}
          disabled={blocked || saving}
          onChange={(value) => {
            const status = statuses.find((status) => status === value);
            if (status) void change(status);
          }}
        />
      </FieldGroup>
      {mutation.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          Guardando estado…
        </p>
      )}
      {blocked && (
        <p className="text-sm text-muted-foreground">
          Guarda o descarta los cambios antes de cambiar el estado.
        </p>
      )}
    </div>
  );
}
