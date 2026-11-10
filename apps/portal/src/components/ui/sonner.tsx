import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/components/theme-provider";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return <Sonner theme={resolvedTheme} containerAriaLabel="Notificaciones" />;
}
