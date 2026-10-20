import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { reservationStatusLabel } from "@/lib/reservation-list";

function statusVariant(status: string) {
  if (status === "confirmed" || status === "checked_in" || status === "checked_out") {
    return status;
  }
  return status === "cancelled" ? "cancelled" : "secondary";
}

export function ReservationStatusBadge({
  status,
  children,
}: {
  status: string;
  children?: ReactNode;
}) {
  return (
    <Badge variant={statusVariant(status)} className="w-24 px-1.5">
      {children}
      {reservationStatusLabel(status)}
    </Badge>
  );
}
