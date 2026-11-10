import { toast } from "sonner";

export function toastError(title: string, cause?: unknown) {
  const message =
    typeof cause === "string" ? cause : cause instanceof Error ? cause.message : undefined;
  toast.error(title, { description: message && message !== title ? message : undefined });
}
