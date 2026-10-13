import type { AnyFormApi } from "@tanstack/react-form"

export function setServerErrors(
  form: AnyFormApi,
  fields: Record<string, string>
) {
  form.setErrorMap({ onServer: { fields } })
}
