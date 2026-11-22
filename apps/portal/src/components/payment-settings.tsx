import { useState } from "react";
import { toast } from "sonner";
import { PageError } from "@/components/page-error";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, NetworkError } from "@/lib/api-error";
import { knownErrorMessage } from "@/lib/errors";
import { propertyTimeZone } from "@/lib/property-calendar";
import { usePublicPaymentAdmission, useSetPublicPaymentAdmission } from "@/lib/queries";

const SAVE_FAILED = "No se pudo guardar el cambio. Inténtalo de nuevo.";

function saveFailure(cause: unknown) {
  if (cause instanceof ApiError) return knownErrorMessage(cause.code) ?? SAVE_FAILED;
  if (cause instanceof NetworkError) return cause.message;
  return SAVE_FAILED;
}

function changedAt(updatedAt: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: propertyTimeZone(),
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(updatedAt));
}

export function PaymentSettings() {
  const admission = usePublicPaymentAdmission(true);
  const save = useSetPublicPaymentAdmission();
  const [confirmingOn, setConfirmingOn] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function change(admitted: boolean) {
    setConfirmingOn(false);
    setFailure(null);
    try {
      await save.mutateAsync({ admitted });
      toast.success(admitted ? "Pagos en línea activados." : "Pagos en línea pausados.");
    } catch (cause) {
      setFailure(saveFailure(cause));
    }
  }

  if (admission.isPending)
    return (
      <div
        aria-busy="true"
        aria-label="Cargando pagos en línea"
        className="flex flex-col gap-3 border p-6"
      >
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10" />
      </div>
    );
  if (!admission.data)
    return <PageError error={admission.error} onRetry={() => void admission.refetch()} />;

  const { admitted, updatedAt } = admission.data;
  return (
    <div className="border bg-muted/15 px-4 sm:px-6">
      <FieldGroup className="gap-0">
        <Field orientation="responsive" className="py-5" data-invalid={failure !== null}>
          <FieldContent>
            <FieldLabel htmlFor="configuration-public-payments">Pagos en línea</FieldLabel>
            <FieldDescription>
              Acepta nuevos pagos con tarjeta o Yape en la web. Pausa los pagos durante un
              mantenimiento o una falla de Culqi; los pagos ya iniciados pueden terminar.
            </FieldDescription>
            <FieldDescription id="configuration-public-payments-state">
              {admitted ? "Activados" : "Pausados"}
              {updatedAt ? ` · Último cambio: ${changedAt(updatedAt)}` : ""}
            </FieldDescription>
            {failure && <FieldError>{failure}</FieldError>}
          </FieldContent>
          <Switch
            id="configuration-public-payments"
            aria-describedby="configuration-public-payments-state"
            checked={admitted}
            disabled={save.isPending}
            onCheckedChange={(checked) => {
              if (checked) setConfirmingOn(true);
              else void change(false);
            }}
          />
        </Field>
      </FieldGroup>
      <AlertDialog open={confirmingOn} onOpenChange={setConfirmingOn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar pagos en línea?</AlertDialogTitle>
            <AlertDialogDescription>
              La web volverá a cobrar pagos nuevos con tarjeta o Yape. Actívalos solo cuando Culqi
              funcione con normalidad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmingOn(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void change(true)}>Activar pagos</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
