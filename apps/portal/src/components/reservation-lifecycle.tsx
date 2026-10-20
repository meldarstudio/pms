import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { ReservationDetail, WorkflowAction } from "@/lib/api";
import { useReservationSaving, useWorkflowCommand } from "@/lib/queries";
import { isReservationSaving } from "@/lib/workflow-query-cache";
import { createWorkflowSaver } from "@/lib/workflow-save";
import { reservationStatusLabel } from "@/lib/reservation-list";
import { toast, toastError } from "@/lib/toast";

type Status = Extract<WorkflowAction, { type: "set-status" }>["status"];
const statuses = ["confirmed", "checked_in", "checked_out", "cancelled"] as const;

export function ReservationLifecycle({
  detail,
  blocked = false,
  showStatusMenu = true,
  onConfirm,
}: {
  detail: ReservationDetail;
  blocked?: boolean;
  showStatusMenu?: boolean;
  onConfirm: (status: Status) => void;
}) {
  const client = useQueryClient();
  const mutation = useWorkflowCommand(detail.id);
  const saving = useReservationSaving(detail.id);
  const [save] = useState(createWorkflowSaver);
  const pending = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const routine =
    detail.status === "confirmed"
      ? "checked_in"
      : detail.status === "checked_in"
        ? "checked_out"
        : null;
  async function change(status: Status) {
    if (blocked || pending.current || isReservationSaving(client, detail.id)) return;
    setMenuOpen(false);
    if (status === "cancelled" || detail.status === "cancelled") {
      onConfirm(status);
      return;
    }
    pending.current = true;
    try {
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
  if (!routine && !showStatusMenu) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div
        role="group"
        className="flex flex-wrap gap-2"
        aria-label="Acciones de estado"
        aria-busy={saving}
      >
        {routine && (
          <Button type="button" disabled={blocked || saving} onClick={() => void change(routine)}>
            {mutation.isPending
              ? "Guardando estado…"
              : routine === "checked_in"
                ? "Hacer check-in"
                : "Hacer check-out"}
          </Button>
        )}
        {showStatusMenu && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" disabled={blocked || saving} />}
            >
              {mutation.isPending && !routine ? "Guardando estado…" : "Cambiar estado"}
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {statuses
                  .filter((status) => status !== detail.status)
                  .map((status) => (
                    <DropdownMenuItem
                      key={status}
                      disabled={blocked || saving}
                      variant={status === "cancelled" ? "destructive" : "default"}
                      onClick={() => void change(status)}
                    >
                      {status === "cancelled"
                        ? "Cancelar reserva…"
                        : `${reservationStatusLabel(status)}${detail.status === "cancelled" ? "…" : ""}`}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {blocked && (
        <p className="text-sm text-muted-foreground">
          Guarda o descarta los cambios antes de cambiar el estado.
        </p>
      )}
    </div>
  );
}
