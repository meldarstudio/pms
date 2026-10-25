import { useId } from "react";
import { RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";
import { cn } from "cn";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChoiceField } from "@/components/workflow-fields";
import { reservationStatusLabel } from "@/lib/reservation-list";
import {
  ReservationStatusSelection,
  reservationStatusValues,
} from "@/lib/reservation-status-selection";
import { viewDefaults, type ReservationsSearch } from "@/lib/route-search";

export function ReservationListFilters({
  search,
  onChange,
}: {
  search: ReservationsSearch;
  onChange: (next: Partial<ReservationsSearch>) => void;
}) {
  const id = useId();
  const mobile = useIsMobile();
  const selectedStatuses = ReservationStatusSelection.parse(search.statuses);
  const filterCount =
    Number(search.balance !== "all") +
    Number(search.assignment !== "all") +
    Number(selectedStatuses.toSearch() !== viewDefaults(search.view).statuses);
  const trigger = (
    <Button
      variant="outline"
      className="min-h-11 md:min-h-0"
      aria-label="Filtros"
      aria-describedby={filterCount ? `${id}-count` : undefined}
    />
  );
  const triggerContent = (
    <>
      <SlidersHorizontalIcon data-icon="inline-start" />
      Filtros
      {filterCount ? (
        <Badge variant="secondary" className="min-w-5 rounded-full px-1.5" aria-hidden="true">
          {filterCount}
        </Badge>
      ) : null}
    </>
  );
  const reset = (
    <Button
      variant="ghost"
      size="sm"
      className={cn("shrink-0", mobile && "min-h-11")}
      disabled={filterCount === 0}
      onClick={() =>
        onChange({
          statuses: viewDefaults(search.view).statuses,
          balance: "all",
          assignment: "all",
        })
      }
    >
      <RotateCcwIcon data-icon="inline-start" />
      Restablecer
    </Button>
  );
  const controls = (
    <FieldGroup className="gap-4">
      {search.view !== "in-house" ? (
        <FieldSet>
          <FieldLegend>Estados</FieldLegend>
          <FieldGroup className={cn("gap-3", mobile && "gap-0")}>
            {reservationStatusValues.map((status) => {
              const checked = selectedStatuses.values.includes(status);
              const disabled = checked && selectedStatuses.values.length === 1;
              return (
                <Field key={status} orientation="horizontal" data-disabled={disabled || undefined}>
                  <Checkbox
                    id={`${id}-${status}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onChange({
                        statuses: selectedStatuses.withStatus(status, checked).toSearch(),
                      })
                    }
                  />
                  <FieldLabel
                    htmlFor={`${id}-${status}`}
                    className={cn(mobile && "min-h-11 items-center")}
                  >
                    {reservationStatusLabel(status)}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      ) : null}
      <ChoiceField
        label="Saldo"
        value={search.balance}
        touchTargets={mobile}
        options={[
          { value: "all", label: "Cualquier saldo" },
          { value: "outstanding", label: "Saldo pendiente" },
          { value: "settled", label: "Saldada" },
          { value: "credit", label: "Con crédito" },
        ]}
        onChange={(balance) => onChange({ balance: balance as ReservationsSearch["balance"] })}
      />
      <ChoiceField
        label="Asignación"
        value={search.assignment}
        touchTargets={mobile}
        options={[
          { value: "all", label: "Cualquier asignación" },
          { value: "assigned", label: "Todas asignadas" },
          { value: "unassigned", label: "Con habitaciones sin asignar" },
        ]}
        onChange={(assignment) =>
          onChange({ assignment: assignment as ReservationsSearch["assignment"] })
        }
      />
    </FieldGroup>
  );

  return (
    <>
      {mobile ? (
        <Sheet>
          <SheetTrigger render={trigger}>{triggerContent}</SheetTrigger>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            aria-describedby={undefined}
            className="max-h-[calc(100dvh-1rem)]"
          >
            <SheetHeader className="shrink-0 flex-row items-center justify-between gap-2">
              <SheetTitle>Filtros de reservas</SheetTitle>
              {reset}
            </SheetHeader>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4">{controls}</div>
            <SheetFooter className="shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <SheetClose render={<Button className="min-h-11" />}>Listo</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover>
          <PopoverTrigger render={trigger}>{triggerContent}</PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-[min(32rem,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto p-4"
          >
            <PopoverHeader className="flex-row items-center justify-between gap-2">
              <PopoverTitle>Filtros de reservas</PopoverTitle>
              {reset}
            </PopoverHeader>
            {controls}
          </PopoverContent>
        </Popover>
      )}
      {filterCount ? (
        <span id={`${id}-count`} className="sr-only">
          {filterCount}{" "}
          {filterCount === 1 ? "grupo de filtros modificado" : "grupos de filtros modificados"}
        </span>
      ) : null}
    </>
  );
}
