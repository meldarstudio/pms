import { MoonIcon, PencilIcon } from "lucide-react";
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
        <Button variant="outline" size="sm" onClick={() => edit({ kind: "stay" })}>
          <PencilIcon data-icon="inline-start" />
          Editar estadía
        </Button>
      }
    >
      <StayDates detail={detail} />
      <dl className="grid grid-cols-2 gap-4">
        <StayFact label="Ocupantes" value={occupantsLabel(detail.rooms)} />
        <StayFact
          label="Tarifa"
          value={ratePlanLabels[detail.ratePlan.plan]}
          className="items-end text-right"
        />
      </dl>
      <div className="pt-2">
        <AssignedRooms detail={detail} />
      </div>
    </ReservationSection>
  );
}

function StayDates({ detail }: { detail: ReservationDetail }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <StayEnd day={detail.checkIn} label="Ingreso" />
      <div className="flex flex-col items-center gap-1.5 text-xs">
        <span aria-hidden className="flex items-center gap-2 text-muted-foreground">
          <span className="h-px w-6 bg-border sm:w-16" />
          <MoonIcon className="size-3.5" />
          <span className="h-px w-6 bg-border sm:w-16" />
        </span>
        <span className="font-medium">
          {nightsLabel(nightsBetween(detail.checkIn, detail.checkOut))}
        </span>
      </div>
      <StayEnd day={detail.checkOut} label="Egreso" className="items-end text-right" />
    </div>
  );
}

function StayEnd({ day, label, className }: { day: string; label: string; className?: string }) {
  const date = parseISO(day);
  return (
    <p className={cn("flex min-w-0 flex-col", className)}>
      <span className="sr-only">{label}: </span>
      <span className="text-3xl font-semibold tracking-tight capitalize">
        {format(date, "EEE d")}
      </span>
      <span className="text-xs text-muted-foreground capitalize">{format(date, "MMMM yyyy")}</span>
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
      <dt className="text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
