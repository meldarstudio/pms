import type { AnyFormApi, ValidationLogicFn } from "@tanstack/react-form";

export function fieldErrors(errors: readonly unknown[]) {
  return errors.flatMap((error) => {
    if (typeof error === "string") return [{ message: error }];
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    )
      return [{ message: error.message }];
    return [];
  });
}

export function errorMessage(errors: readonly unknown[]) {
  const messages = fieldErrors(errors).map((error) => error.message);
  return [...new Set(messages)].join(" ") || undefined;
}

export function setServerErrors(
  form: Pick<AnyFormApi, "setErrorMap">,
  fields: Record<string, string>,
) {
  form.setErrorMap({ onServer: { fields } });
}

const clearServerError = { fn: () => undefined, cause: "server" } as const;

export const clearServerErrorsOnlyOnOwnChangeOrSubmit =
  (logic: ValidationLogicFn): ValidationLogicFn =>
  (props) =>
    logic({
      ...props,
      runValidation: ({ validators, form }) => {
        const { type, fieldName, async } = props.event;
        const ownFieldChanged = type === "change" && !!fieldName && !async;
        return props.runValidation({
          form,
          validators: [
            ...validators.filter((validator) => validator?.cause !== "server" || type === "submit"),
            ...(ownFieldChanged ? [clearServerError] : []),
          ],
        });
      },
    });
