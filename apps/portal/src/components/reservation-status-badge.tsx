import { Badge } from "@/components/ui/badge";
import { reservationStatusLabel } from "@/lib/reservation-list";

function statusVariant(status: string) {
  if (status === "confirmed" || status === "checked_in" || status === "checked_out") {
    return status;
  }
  return status === "cancelled" || status === "unfulfilled" ? "cancelled" : "secondary";
}

export function ReservationStatusBadge({ status, compact }: { status: string; compact?: boolean }) {
  return (
    <Badge variant={statusVariant(status)} className={compact ? undefined : "min-w-24 px-1.5"}>
      {reservationStatusLabel(status)}
    </Badge>
  );
}
