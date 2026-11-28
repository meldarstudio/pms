import { PencilIcon } from "lucide-react";
import { cn } from "cn";
import { parseISO } from "date-fns";
import { AssignedRooms } from "@/components/assigned-rooms";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import { ReservationSection } from "@/components/reservation-section";
import { Button } from "@/components/ui/button";
import type { ReservationDetail } from "@/lib/api";
import { format, nightsBetween } from "@/lib/dates";
import { ratePlanLabels } from "@/lib/rate-plans";
import { occupantsLabel } from "@/lib/reservation-list";
import { holdsInventory } from "@/lib/reservation-statuses";

const nightsLabel = (count: number) => `${count} ${count === 1 ? "noche" : "noches"}`;

export function StaySection({
  detail,
  edit,
}: {
  detail: ReservationDetail;
  edit: (target: ReservationEditorTarget) => void;
}) {
  return (
    <ReservationSection
      title="Estadía"
      action={
        <Button
          variant="ghost"
          size="xs"
          className="pointer-coarse:min-h-(--control-h-lg)"
          onClick={() => edit({ kind: "stay" })}
        >
          <PencilIcon data-icon="inline-start" />
          Editar estadía
        </Button>
      }
    >
      <div className="max-md:py-2">
        <StayDates detail={detail} />
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <StayFact label="Ocupantes" value={occupantsLabel(detail.rooms)} />
        <StayFact
          label="Tarifa"
          value={ratePlanLabels[detail.ratePlan.plan]}
          className="items-end text-right"
        />
      </dl>
      <div className="flex min-w-0 flex-col gap-2 pt-2">
        {holdsInventory(detail.status) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Habitaciones
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="pointer-coarse:min-h-(--control-h-lg)"
              aria-haspopup="dialog"
              onClick={(event) => edit({ kind: "rooms", trigger: event.currentTarget })}
            >
              <PencilIcon data-icon="inline-start" />
              Editar habitaciones
            </Button>
          </div>
        )}
        <AssignedRooms detail={detail} />
      </div>
    </ReservationSection>
  );
}

function StayDates({ detail }: { detail: ReservationDetail }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <StayEnd day={detail.checkIn} label="Ingreso" />
      <span className="text-xs text-muted-foreground">
        {nightsLabel(nightsBetween(detail.checkIn, detail.checkOut))}
      </span>
      <StayEnd day={detail.checkOut} label="Salida" className="items-end text-right" />
    </div>
  );
}

function StayEnd({ day, label, className }: { day: string; label: string; className?: string }) {
  const date = parseISO(day);
  return (
    <p className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        <span className="sr-only">: </span>
      </span>
      <span className="text-xl font-semibold tracking-tight capitalize">
        {format(date, "EEE d")}
      </span>
      <span className="text-xs text-muted-foreground capitalize">
        <span className="md:hidden">{format(date, "MMM yyyy")}</span>
        <span className="max-md:hidden">{format(date, "MMMM yyyy")}</span>
      </span>
    </p>
  );
}

function StayFact({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm max-md:text-xs">{value}</dd>
    </div>
  );
}
