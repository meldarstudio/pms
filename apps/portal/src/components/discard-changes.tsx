import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DiscardChanges({
  onStay,
  onLeave,
  saving = false,
}: {
  onStay: () => void;
  onLeave: () => void;
  saving?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onStay()}>
      <DialogContent closeDisabled={saving} className="flex max-h-[90dvh] flex-col overflow-hidden">
        <DialogHeader className="min-h-0 overflow-y-auto">
          <DialogTitle>{saving ? "Guardando cambios" : "Hay cambios sin guardar"}</DialogTitle>
          <DialogDescription>
            {saving
              ? "Espera a que termine el guardado antes de salir."
              : "Si sales ahora, se descartarán tus cambios en esta reserva."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onStay}>
            Seguir editando
          </Button>
          <Button type="button" variant="destructive" disabled={saving} onClick={onLeave}>
            Descartar y salir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
