import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "cn";
import { addDays, eachDayOfInterval, parse, startOfDay } from "date-fns";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";

import { InventoryRateDialog, type RateTarget } from "@/components/inventory-rate-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { PropertyDatePicker } from "@/components/property-date-picker";
import { dateOnlyCarrier } from "@/lib/property-calendar";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SetupRequired } from "@/components/setup-required";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { PickerTodayFooter } from "@/components/picker-today-footer";
import { RefreshButton } from "@/components/refresh-button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { InventoryNight, InventoryRoomType } from "@/lib/api";
import { CURRENCY, formatMoney } from "@/lib/money";
import { format } from "@/lib/dates";
import { useInventory } from "@/lib/queries";
import { datesBetween } from "@/lib/rate-ranges";

const spans = [
  { label: "7 días", value: "7" },
  { label: "14 días", value: "14" },
];

type Selection = {
  roomTypeId: string;
  dates: string[];
};

function parseDay(value: string) {
  return parse(value, "yyyy-MM-dd", new Date());
}

function nightLabel(dates: string[]) {
  const first = parseDay(dates[0]);
  const last = parseDay(dates[dates.length - 1]);
  if (dates.length === 1) return format(first, "EEE, d MMM yyyy");
  return `${format(first, "d MMM")} al ${format(last, "d MMM yyyy")}`;
}

function availabilityLabel(nights: InventoryNight[]) {
  if (nights.length === 1) {
    const night = nights[0];
    return `${night.free} libres, ${night.booked} reservadas, ${night.closed} cerradas`;
  }
  const lowest = Math.min(...nights.map((night) => night.free));
  return `${nights.length} noches, mínimo de habitaciones libres: ${lowest}`;
}

export function Inventory({
  start,
  span,
  onStartChange,
  onSpanChange,
}: {
  start: Date;
  span: 7 | 14;
  onStartChange: (date: Date) => void;
  onSpanChange: (span: 7 | 14) => void;
}) {
  const { today } = usePropertyCalendar();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editor, setEditor] = useState<Selection | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const dragging = useRef(false);
  const anchor = useRef<Selection | null>(null);
  const pointerCell = useRef<HTMLButtonElement | null>(null);
  const from = format(start, "yyyy-MM-dd");
  const to = format(addDays(start, span - 1), "yyyy-MM-dd");
  const inventory = useInventory(from, to);
  const grid = inventory.data?.from === from && inventory.data.to === to ? inventory.data : null;
  const days = eachDayOfInterval({ start, end: addDays(start, span - 1) });
  const dayIds = days.map((day) => format(day, "yyyy-MM-dd"));
  const loading = grid === null && !inventory.isError;
  const loadError = grid ? null : inventory.error;
  const retry = () => void queryClient.invalidateQueries({ queryKey: ["inventory"] });
  const [refreshing, setRefreshing] = useState(false);
  function refresh() {
    setRefreshing(true);
    void queryClient
      .invalidateQueries({ queryKey: ["inventory"] })
      .finally(() => setRefreshing(false));
  }

  useEffect(() => {
    function onUp(event: Event) {
      if (!dragging.current) return;
      dragging.current = false;
      const target = event.target;
      const releasedOnStart = target instanceof Node && pointerCell.current?.contains(target);
      if (releasedOnStart) return;
      const current = selectionRef.current;
      if (current && current.dates.length > 0) setEditor(current);
    }
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function choose(next: Selection | null) {
    selectionRef.current = next;
    setSelection(next);
  }

  function changeStart(next: Date) {
    dragging.current = false;
    choose(null);
    setEditor(null);
    onStartChange(startOfDay(next));
  }

  function onCellPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    roomTypeId: string,
    date: string,
  ) {
    if (event.button !== 0) return;
    pointerCell.current = event.currentTarget;
    if (event.shiftKey && anchor.current?.roomTypeId === roomTypeId) {
      const next = {
        roomTypeId,
        dates: datesBetween(dayIds, anchor.current.dates[0], date),
      };
      choose(next);
      return;
    }
    const next = { roomTypeId, dates: [date] };
    anchor.current = next;
    choose(next);
    dragging.current = true;
  }

  function onCellPointerEnter(roomTypeId: string, date: string) {
    if (!dragging.current || anchor.current?.roomTypeId !== roomTypeId) return;
    choose({
      roomTypeId,
      dates: datesBetween(dayIds, anchor.current.dates[0], date),
    });
  }

  const rateTarget = editor ? rateTargetFor(grid?.roomTypes ?? [], editor) : null;

  if (grid?.roomTypes.length === 0) return <SetupRequired missing="types" />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <InventoryRateDialog
        target={rateTarget}
        currency={CURRENCY}
        onClose={() => setEditor(null)}
      />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-2.5 py-2">
        <div className="flex items-center gap-2">
          {!isMobile && (
            <>
              <Select
                items={spans}
                value={String(span)}
                onValueChange={(value) => {
                  if (!value) return;
                  dragging.current = false;
                  choose(null);
                  setEditor(null);
                  onSpanChange(Number(value) as 7 | 14);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  <SelectGroup>
                    {spans.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => changeStart(dateOnlyCarrier(today))}>
                Hoy
              </Button>
            </>
          )}
          <RefreshButton
            refreshing={refreshing}
            disabled={loading}
            size="icon"
            onRefresh={refresh}
          />
        </div>
        <ButtonGroup>
          {!isMobile && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Período anterior"
              onClick={() => changeStart(addDays(start, -span))}
            >
              <ChevronsLeftIcon />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Día anterior"
            onClick={() => changeStart(addDays(start, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={<Button variant="outline" className="min-w-32 justify-between md:min-w-36" />}
            >
              {format(start, "d MMM yyyy")}
              <CalendarIcon data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent className="w-auto gap-0 p-0">
              <PropertyDatePicker
                mode="single"
                selected={start}
                onSelect={(date) => {
                  if (!date) return;
                  changeStart(date);
                  setPickerOpen(false);
                }}
              />
              {isMobile && (
                <PickerTodayFooter
                  onToday={() => {
                    changeStart(dateOnlyCarrier(today));
                    setPickerOpen(false);
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            aria-label="Día siguiente"
            onClick={() => changeStart(addDays(start, 1))}
          >
            <ChevronRightIcon />
          </Button>
          {!isMobile && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Período siguiente"
              onClick={() => changeStart(addDays(start, span))}
            >
              <ChevronsRightIcon />
            </Button>
          )}
        </ButtonGroup>
        <div />
      </div>
      {grid && inventory.error ? (
        <div className="border-b p-4">
          <StaleDataNotice error={inventory.error} onRetry={retry} />
        </div>
      ) : null}
      {loadError ? (
        <div className="p-4">
          <PageError error={loadError} onRetry={retry} />
        </div>
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
          <div
            className="grid w-max min-w-full"
            style={{
              gridTemplateColumns: `fit-content(${isMobile ? 10 : 13}rem) repeat(${span}, minmax(5rem, 1fr))`,
            }}
          >
            <div className="sticky top-0 left-0 z-40 min-w-28 border-r border-b bg-background" />
            {days.map((day) => {
              const date = format(day, "yyyy-MM-dd");
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={date}
                  className={cn(
                    "sticky top-0 z-30 flex min-w-0 flex-col items-center gap-0.5 border-r border-b bg-background px-1 py-1.5",
                    weekend && "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs tracking-wide uppercase",
                      date === today ? "font-medium text-primary" : "text-muted-foreground",
                    )}
                  >
                    {date === today ? "Hoy" : format(day, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "flex h-5 min-w-5 items-center justify-center px-1 text-xs",
                      date === today
                        ? "bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <span className="text-xs text-muted-foreground">{format(day, "MMM")}</span>
                </div>
              );
            })}
            {loading
              ? Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="contents">
                    <div className="sticky left-0 z-20 flex min-w-0 flex-col justify-center gap-1 border-r border-b bg-background px-2.5">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-22.75" />
                    </div>
                    <div
                      className="border-b"
                      style={{
                        gridColumn: `2 / span ${span}`,
                        minHeight: "4rem",
                      }}
                    />
                  </div>
                ))
              : null}
            {grid?.roomTypes.map((type) => (
              <TypeRow
                key={type.id}
                type={type}
                currency={CURRENCY}
                days={days}
                selected={selection?.roomTypeId === type.id ? selection.dates : []}
                onPointerDown={onCellPointerDown}
                onPointerEnter={onCellPointerEnter}
                onOpen={(date, keyboard) => {
                  if (keyboard) {
                    const next = { roomTypeId: type.id, dates: [date] };
                    anchor.current = next;
                    choose(next);
                    setEditor(next);
                    return;
                  }
                  const current = selectionRef.current;
                  if (current?.roomTypeId === type.id && current.dates.includes(date)) {
                    setEditor(current);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function rateTargetFor(types: InventoryRoomType[], editor: Selection): RateTarget | null {
  const type = types.find((item) => item.id === editor.roomTypeId);
  if (!type || editor.dates.length === 0) return null;
  const wanted = new Set(editor.dates);
  const nights = type.nights.filter((night) => wanted.has(night.date));
  if (nights.length === 0) return null;
  return {
    roomTypeId: type.id,
    roomTypeName: type.name,
    label: `${nightLabel(editor.dates)}. ${availabilityLabel(nights)}`,
    dates: editor.dates,
    nights,
  };
}

function TypeRow({
  type,
  currency,
  days,
  selected,
  onPointerDown,
  onPointerEnter,
  onOpen,
}: {
  type: InventoryRoomType;
  currency: string;
  days: Date[];
  selected: string[];
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, roomTypeId: string, date: string) => void;
  onPointerEnter: (roomTypeId: string, date: string) => void;
  onOpen: (date: string, keyboard: boolean) => void;
}) {
  const selectedDates = new Set(selected);
  const byDate = new Map(type.nights.map((night) => [night.date, night]));

  return (
    <div className="contents">
      <div className="sticky left-0 z-20 flex min-w-0 flex-col justify-center gap-1 border-r border-b bg-background px-2.5 py-2">
        <span className="truncate text-xs font-medium" title={type.name}>
          {type.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {type.capacity} {type.capacity === 1 ? "habitación" : "habitaciones"}
        </span>
      </div>
      {days.map((day) => {
        const date = format(day, "yyyy-MM-dd");
        const night = byDate.get(date);
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        const isSelected = selectedDates.has(date);
        if (!night) {
          return <div key={date} className="border-r border-b bg-muted/40" />;
        }
        return (
          <button
            key={date}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${type.name}, ${format(day, "d MMM yyyy")}, ${formatMoney(night.priceCents, currency)}, ${night.free} libres`}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 border-r border-b bg-background px-1 py-1.5 outline-none hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
              weekend && "bg-muted/60",
              isSelected && "bg-accent ring-1 ring-ring ring-inset",
            )}
            onPointerDown={(event) => onPointerDown(event, type.id, date)}
            onPointerEnter={() => onPointerEnter(type.id, date)}
            onClick={(event) => onOpen(date, event.detail === 0)}
          >
            <span
              className={cn(
                "text-xs tabular-nums",
                night.override ? "font-medium" : "text-muted-foreground",
              )}
            >
              {formatMoney(night.priceCents, currency)}
            </span>
            <Badge variant={night.free === 0 ? "destructive" : "outline"}>{night.free}</Badge>
          </button>
        );
      })}
    </div>
  );
}
