import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/** Re-reads a page's data on demand; spins and disables itself while that read runs. */
export function RefreshButton({
  refreshing,
  disabled,
  size = "icon-sm",
  onRefresh,
}: {
  refreshing: boolean;
  disabled?: boolean;
  size?: "icon" | "icon-sm";
  onRefresh: () => void;
}) {
  return (
    <Button
      variant="outline"
      size={size}
      aria-label={refreshing ? "Actualizando…" : "Actualizar"}
      aria-busy={refreshing || undefined}
      disabled={disabled || refreshing}
      onClick={onRefresh}
    >
      <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
    </Button>
  );
}
