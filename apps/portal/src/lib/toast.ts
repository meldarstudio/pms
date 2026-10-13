import { Toast } from "@base-ui/react/toast"

export const toast = Toast.createToastManager()

export function toastError(title: string, cause?: unknown) {
  const message = cause instanceof Error ? cause.message : undefined
  toast.add({
    title,
    description: message && message !== title ? message : undefined,
    type: "error",
    priority: "high",
    timeout: 7000,
  })
}
