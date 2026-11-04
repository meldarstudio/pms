import { ShareIcon, SmartphoneIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function IphoneInstall() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (!/iPhone|iPod|iPad/.test(navigator.userAgent) || standalone) return null;

  return (
    <SidebarMenuItem>
      <Dialog>
        <DialogTrigger render={<SidebarMenuButton />}>
          <SmartphoneIcon />
          <span>Instalar aplicación</span>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manantial en tu pantalla de inicio</DialogTitle>
            <DialogDescription>
              Abre el portal como una aplicación desde el ícono de tu hotel.
            </DialogDescription>
          </DialogHeader>
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            <li>Abre este portal en Safari.</li>
            <li>
              Toca Compartir <ShareIcon aria-hidden="true" className="inline size-4" /> en el menú
              de Safari.
            </li>
            <li>Elige Agregar a pantalla de inicio.</li>
            <li>Si aparece Abrir como app web, actívalo. Luego toca Agregar.</li>
          </ol>
          <p className="text-muted-foreground">
            Después, abre Manantial desde la pantalla de inicio. Necesitas conexión para gestionar
            el hotel.
          </p>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </SidebarMenuItem>
  );
}
