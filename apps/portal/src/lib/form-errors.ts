import type { AnyFormApi } from "@tanstack/react-form"

export function fieldErrors(errors: readonly unknown[]) {
  return errors.flatMap((error) => {
    if (typeof error === "string") return [{ message: error }]
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    )
      return [{ message: error.message }]
    return []
  })
}

export function errorMessage(errors: readonly unknown[]) {
  const messages = fieldErrors(errors).map((error) => error.message)
  return [...new Set(messages)].join(" ") || undefined
}

export function setServerErrors(
  form: AnyFormApi,
  fields: Record<string, string>
) {
  form.setErrorMap({ onServer: { fields } })
}
