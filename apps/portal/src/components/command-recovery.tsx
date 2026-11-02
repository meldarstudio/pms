import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { outcomeSaveError } from "@/components/outcome-command-preview";
import { earlierAttemptSaved, useReservationCommands } from "@/lib/reservation-commands";
import { toast, toastError } from "@/lib/toast";

export function CommandRecovery({
  reservationId,
  retryKey,
  disabled,
  onDone,
}: {
  reservationId: string;
  retryKey: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const commands = useReservationCommands(reservationId);
  if (!commands.canReplay([], retryKey)) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <FieldDescription>
        El resultado del intento anterior no está confirmado. Se comprobará con sus datos
        originales, sin aplicar los cambios del borrador.
      </FieldDescription>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || commands.saving}
        onClick={async () => {
          const result = await commands.replay(retryKey);
          if (
            result.status === "saved" ||
            (result.status === "failed" && result.code === earlierAttemptSaved)
          ) {
            toast.add({
              title: "Intento anterior comprobado",
              description: "Revisa los cambios guardados en Movimientos.",
              type: "success",
            });
            onDone();
          } else if (result.status === "failed") outcomeSaveError(result);
          else toastError("No se pudo guardar", Object.values(result.fields).join(" "));
        }}
      >
        Comprobar intento anterior
      </Button>
    </div>
  );
}
