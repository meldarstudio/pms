import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";

export function ReservationStatusMenu({
  detail,
  disabled,
  edit,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  edit: (target: ReservationEditorTarget) => void;
}) {
  if (detail.status === "unfulfilled") return null;
  const cancelled = detail.status === "cancelled";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Acciones de la reserva"
            disabled={disabled}
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {cancelled ? (
            <DropdownMenuItem onClick={() => edit({ kind: "status", status: "confirmed" })}>
              Restaurar reserva
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={() => edit({ kind: "correct-status" })}>
                Corregir estado…
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => edit({ kind: "status", status: "cancelled" })}
              >
                Cancelar reserva
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
