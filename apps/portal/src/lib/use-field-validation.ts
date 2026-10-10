import { useState } from "react"

import { focusFirstError, type FieldErrors } from "./form-validation"

export function useFieldValidation(errors: FieldErrors) {
  const [attempted, setAttempted] = useState(false)
  const [touched, setTouched] = useState<Set<string>>(() => new Set())

  function touch(id: string) {
    setTouched((current) => new Set(current).add(id))
  }

  function errorFor(id: string) {
    return attempted || touched.has(id) ? (errors[id] ?? null) : null
  }

  function validate(form: HTMLFormElement) {
    setAttempted(true)
    if (!Object.values(errors).some(Boolean)) return true
    focusFirstError(form, errors)
    return false
  }

  function reset() {
    setAttempted(false)
    setTouched(new Set())
  }

  return { errorFor, touch, validate, reset }
}
