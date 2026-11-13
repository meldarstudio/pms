import { useEffect, useId, useRef, useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { discountSchema } from "@/lib/reservation-form-schemas";
import { formatMoney, parseMajorToCents } from "@/lib/money";

const draftOf = (cents: number) =>
  cents === 0 ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

export function DiscountPopover({
  appliedCents,
  shownCents = appliedCents,
  currency,
  disabled = false,
  onApply,
  onBlockingChange,
}: {
  appliedCents: number;
  shownCents?: number | null;
  currency: string;
  disabled?: boolean;
  onApply: (amountCents: number) => void | boolean | Promise<boolean | void>;
  onBlockingChange?: (blocking: boolean) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [state, setState] = useState<
    | { kind: "closed" | "editing"; draft: string | null; attempted: boolean }
    | { kind: "applying"; draft: string; attempted: boolean }
  >({ kind: "closed", draft: null, attempted: false });
  const inFlight = useRef(false);
  const open = state.kind !== "closed";
  const applying = state.kind === "applying";
  const attempted = state.attempted;
  const draft = state.draft ?? draftOf(appliedCents);
  const parsed = discountSchema.safeParse({ amount: draft });
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);
  const draftCents = parsed.success ? parseMajorToCents(draft.trim() || "0") : null;
  const blocking = open && (draftCents === null || draftCents !== appliedCents);
  useEffect(() => onBlockingChange?.(blocking), [blocking, onBlockingChange]);
  useEffect(() => () => onBlockingChange?.(false), [onBlockingChange]);

  async function apply(cents: number | null) {
    if (inFlight.current || state.kind !== "editing") return;
    if (cents === null) return setState({ ...state, attempted: true });
    inFlight.current = true;
    setState({ ...state, kind: "applying", draft: cents === draftCents ? draft : draftOf(cents) });
    try {
      if ((await onApply(cents)) === false) return;
      setState({ kind: "closed", draft: null, attempted: false });
    } finally {
      inFlight.current = false;
      setState((current) =>
        current.kind === "applying" ? { ...current, kind: "editing" } : current,
      );
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (inFlight.current) return;
        setState((current) => ({ ...current, kind: next ? "editing" : "closed" }));
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between border-0 px-0 py-0 font-normal pointer-coarse:min-h-(--control-h-xs) underline-offset-4 hover:bg-transparent hover:underline aria-expanded:bg-transparent aria-expanded:underline dark:hover:bg-transparent"
          />
        }
      >
        <span className="flex items-center gap-1">
          Descuento
          <PencilIcon aria-hidden className="size-3 text-muted-foreground" />
        </span>
        <span className="tabular-nums">
          {shownCents === null ? (
            <span aria-label="No disponible">...</span>
          ) : (
            formatMoney(shownCents ? -shownCents : 0, currency)
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <PopoverTitle className="sr-only">Descuento</PopoverTitle>
        <Field data-invalid={(attempted && !!error) || undefined}>
          <FieldLabel htmlFor={inputId}>Descuento · S/</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="text-right tabular-nums"
              value={draft}
              disabled={applying}
              aria-invalid={(attempted && !!error) || undefined}
              aria-describedby={attempted && error ? errorId : undefined}
              onChange={(event) =>
                setState({
                  kind: "editing",
                  attempted,
                  draft: event.target.value === draftOf(appliedCents) ? null : event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void apply(draftCents);
              }}
            />
            <Button type="button" disabled={applying} onClick={() => void apply(draftCents)}>
              Aplicar
            </Button>
          </div>
          {attempted && error && <FieldError id={errorId}>{error}</FieldError>}
        </Field>
        {appliedCents > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-fit"
            disabled={applying}
            onClick={() => void apply(0)}
          >
            Quitar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
