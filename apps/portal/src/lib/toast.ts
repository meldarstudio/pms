import { Toast } from "@base-ui/react/toast";

export const toast = Toast.createToastManager();

/** `cause` is an error or an already translated message. */
export function toastError(title: string, cause?: unknown) {
  const message =
    typeof cause === "string" ? cause : cause instanceof Error ? cause.message : undefined;
  toast.add({
    title,
    description: message && message !== title ? message : undefined,
    type: "error",
    priority: "high",
    timeout: 7000,
  });
}
