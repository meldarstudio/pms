export type FieldErrors = Record<string, string | null>

export function contactErrors(fullName: string, email: string) {
  return {
    fullName: fullName.trim() ? null : "Ingresa el nombre completo.",
    email:
      email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? "Ingresa un correo válido."
        : null,
  }
}

export function partyCounts(adults: string, children: string) {
  const adultCount = Number(adults)
  const childCount = Number(children)
  const adultsError =
    !adults.trim() || !Number.isSafeInteger(adultCount) || adultCount < 1
      ? "Mínimo 1 adulto."
      : null
  const childrenError =
    !children.trim() || !Number.isSafeInteger(childCount) || childCount < 0
      ? "Ingresa 0 o más niños."
      : null
  return {
    adultCount,
    childCount,
    adultsError,
    childrenError,
    valid: !adultsError && !childrenError,
  }
}

export function focusFirstError(form: HTMLFormElement, errors: FieldErrors) {
  // Wait for the error messages to mount before focusing their controls.
  requestAnimationFrame(() => {
    if (!form.isConnected) return
    const control = Array.from(form.querySelectorAll<HTMLElement>("[id]")).find(
      (element) => errors[element.id] && !element.matches(":disabled")
    )
    control?.focus({ preventScroll: true })
    control?.scrollIntoView({ block: "nearest" })
  })
}
