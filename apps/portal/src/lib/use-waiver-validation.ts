import { useRef } from "react";
import type { AnyFormApi } from "@tanstack/react-form";
import type { cancellationOutcomeSchema } from "./reservation-form-schemas.ts";

type WaiverValues = { amount: string; reason: string };

export function useWaiverValidation(schema: ReturnType<typeof cancellationOutcomeSchema>) {
  const rejected = useRef<{ amount: string; fields: Record<string, string> } | null>(null);
  return {
    validate(value: WaiverValues) {
      const result = schema.safeParse(value);
      const fields = result.success
        ? {}
        : Object.fromEntries(
            result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
          );
      if (rejected.current?.amount === value.amount) Object.assign(fields, rejected.current.fields);
      return Object.keys(fields).length ? { fields } : undefined;
    },
    reject(form: Pick<AnyFormApi, "setErrorMap">, amount: string, fields: Record<string, string>) {
      rejected.current = { amount, fields };
      form.setErrorMap({ onDynamic: { fields } });
    },
  };
}
