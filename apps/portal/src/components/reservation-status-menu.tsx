import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

export function ReservationStatusMenu({
  detail,
  disabled,
  edit,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  edit: (target: ReservationEditorTarget) => void;
}) {
  const { today } = usePropertyCalendar();
  const cancelled = detail.status === "cancelled";
  const noShow = detail.status === "no_show";
  const restoreBlocked =
    detail.refunds.length > 0 || detail.coupons.length > 0 || detail.couponMovements.length > 0;
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
          <DropdownMenuItem onClick={() => edit({ kind: "contact" })}>
            Editar contacto
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {detail.status !== "unfulfilled" && <DropdownMenuSeparator />}
        <DropdownMenuGroup>
          {detail.status === "unfulfilled" ? null : cancelled || noShow ? (
            <>
              <DropdownMenuItem
                disabled={restoreBlocked}
                aria-describedby={restoreBlocked ? "restore-blocked" : undefined}
                onClick={() => edit({ kind: "status", status: "confirmed" })}
              >
                Restaurar reserva
              </DropdownMenuItem>
              {restoreBlocked && (
                <p
                  id="restore-blocked"
                  className="max-w-64 px-2 py-1 text-xs text-muted-foreground"
                >
                  Tiene reembolsos o cupones. Crea una nueva reserva.
                </p>
              )}
              {noShow && (
                <DropdownMenuItem onClick={() => edit({ kind: "correct-status" })}>
                  Corregir estado…
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => edit({ kind: "correct-status" })}>
                Corregir estado…
              </DropdownMenuItem>
              {detail.status === "confirmed" && detail.checkIn <= today && (
                <DropdownMenuItem onClick={() => edit({ kind: "status", status: "no_show" })}>
                  Marcar como no presentado
                </DropdownMenuItem>
              )}
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
