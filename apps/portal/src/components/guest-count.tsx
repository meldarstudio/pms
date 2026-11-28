import { MinusIcon, PlusIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Field, FieldTitle } from "@/components/ui/field";

export function GuestCount({
  label,
  value,
  min,
  max,
  disabled = false,
  errorId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  errorId?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Field
      className="min-w-0 gap-1.5"
      aria-labelledby={id}
      data-disabled={disabled || undefined}
      data-invalid={errorId ? true : undefined}
    >
      <FieldTitle id={id}>{label}</FieldTitle>
      <ButtonGroup className="min-w-0 max-w-48" role="presentation">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={`Reducir ${label.toLowerCase()}`}
          aria-describedby={errorId}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          <MinusIcon />
        </Button>
        <ButtonGroupText className="min-w-0 flex-1 justify-center px-0">
          <output aria-labelledby={id} className="text-sm font-semibold tabular-nums">
            {value}
          </output>
        </ButtonGroupText>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          aria-describedby={errorId}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          <PlusIcon />
        </Button>
      </ButtonGroup>
    </Field>
  );
}
