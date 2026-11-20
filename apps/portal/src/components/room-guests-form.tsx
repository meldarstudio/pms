import { useEffect, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import type { ReservationDetail, WorkflowAction } from "@/lib/api";
import { useRoomTypes } from "@/lib/queries";
import { unsavedMessage, type ReservationCommandResult } from "@/lib/reservation-commands";
import { toastError } from "@/lib/toast";

type Line = ReservationDetail["rooms"][number];
type GuestCounts = { adults: number; children: number };

const staleRoom = "reserved room changed";

export function roomGuestsTitle(line: Line) {
  return line.roomNumber
    ? `Huéspedes · habitación ${line.roomNumber}`
    : `Huéspedes · ${line.roomTypeName || "habitación"}`;
}

export function RoomGuestsForm({
  reservationId,
  line,
  disabled,
  onSave,
  onDone,
  onCancel,
  onDirtyChange,
}: {
  reservationId: string;
  line: Line;
  disabled: boolean;
  onSave: (actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onDone: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const client = useQueryClient();
  const roomTypes = useRoomTypes();
  const type = roomTypes.data?.find((entry) => entry.id === line.roomTypeId);
  const [counts, setCounts] = useState<GuestCounts>({
    adults: line.adults,
    children: line.children,
  });
  const [submitting, setSubmitting] = useState(false);
  const saving = disabled || submitting;
  const changed = counts.adults !== line.adults || counts.children !== line.children;
  const withinLimits =
    !!type && counts.adults <= type.maxAdults && counts.children <= type.maxChildren;
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);

  async function save() {
    if (saving || !changed || !withinLimits) return;
    const shown = {
      roomTypeId: line.roomTypeId,
      roomId: line.roomId,
      adults: line.adults,
      children: line.children,
    };
    setSubmitting(true);
    try {
      const result = await onSave([
        { type: "edit-room", lineId: line.id, room: { ...shown, ...counts }, expected: shown },
      ]);
      if (result.status === "saved") {
        toast.success("Cambios guardados");
        onDone();
        return;
      }
      toastError("No se pudo guardar", unsavedMessage(result));
      if (result.status === "failed" && result.code === staleRoom) {
        onDirtyChange(false);
        onDone();
        await client.invalidateQueries({ queryKey: ["reservation", reservationId] });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-4">
        <GuestStepper
          label="Adultos"
          value={counts.adults}
          min={1}
          max={type?.maxAdults}
          disabled={saving}
          onChange={(adults) => setCounts((current) => ({ ...current, adults }))}
        />
        <GuestStepper
          label="Niños"
          value={counts.children}
          min={0}
          max={type?.maxChildren}
          disabled={saving}
          onChange={(children) => setCounts((current) => ({ ...current, children }))}
        />
        {roomTypes.error && (
          <div className="flex flex-col items-start gap-2">
            <FieldError>{roomTypes.error.message}</FieldError>
            <Button type="button" variant="outline" onClick={() => void roomTypes.refetch()}>
              Reintentar
            </Button>
          </div>
        )}
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !changed || !withinLimits}>
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function GuestStepper({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number | undefined;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {max !== undefined && <span className="text-xs text-muted-foreground">Máx. {max}</span>}
      </span>
      <span className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={`Quitar ${label.toLowerCase()}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          <MinusIcon />
        </Button>
        <output aria-live="polite" className="w-8 text-center text-lg font-medium tabular-nums">
          {value}
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={`Agregar ${label.toLowerCase()}`}
          disabled={disabled || max === undefined || value >= max}
          onClick={() => onChange(value + 1)}
        >
          <PlusIcon />
        </Button>
      </span>
    </div>
  );
}
