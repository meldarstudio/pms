import { useEffect, useId, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
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
  variant = "add",
  onApply,
  onBlockingChange,
}: {
  appliedCents: number;
  shownCents?: number | null;
  currency: string;
  disabled?: boolean;
  variant?: "add" | "row";
  onApply: (amountCents: number) => void | boolean | Promise<boolean | void>;
  onBlockingChange?: (blocking: boolean) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [editedDraft, setEditedDraft] = useState<string | null>(null);
  const draft = editedDraft ?? draftOf(appliedCents);
  const [attempted, setAttempted] = useState(false);
  const [applying, setApplying] = useState(false);
  const parsed = discountSchema.safeParse({ amount: draft });
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);
  const draftCents = parsed.success ? parseMajorToCents(draft.trim() || "0") : null;
  const blocking = open && (draftCents === null || draftCents !== appliedCents);
  const row = variant === "row" || appliedCents > 0;
  useEffect(() => onBlockingChange?.(blocking), [blocking, onBlockingChange]);
  useEffect(() => () => onBlockingChange?.(false), [onBlockingChange]);

  async function apply(cents: number | null) {
    if (cents === null) return setAttempted(true);
    setEditedDraft(cents === draftCents ? draft : draftOf(cents));
    setApplying(true);
    try {
      if ((await onApply(cents)) === false) return;
      setEditedDraft(null);
      setAttempted(false);
      setOpen(false);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(next) => !applying && setOpen(next)}>
      <PopoverTrigger
        disabled={disabled}
        render={
          row ? (
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-0 py-0 font-normal hover:bg-transparent"
            />
          ) : (
            <Button type="button" variant="ghost" size="xs" className="w-fit px-0" />
          )
        }
      >
        {row ? (
          <>
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
          </>
        ) : (
          <>
            <PlusIcon data-icon="inline-start" />
            Añadir descuento
          </>
        )}
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
                setEditedDraft(
                  event.target.value === draftOf(appliedCents) ? null : event.target.value,
                )
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
