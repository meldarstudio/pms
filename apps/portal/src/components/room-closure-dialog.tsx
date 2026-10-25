import { useForm, useSelector } from "@tanstack/react-form";
import { addDays, parseISO } from "date-fns";
import { EllipsisIcon } from "lucide-react";

import { DateField } from "@/components/date-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type HousekeepingStatus, type RoomClosure } from "@/lib/api";
import { useDeleteRoomClosure, useSaveRoomClosure } from "@/lib/queries";
import { format } from "@/lib/dates";
import { errorMessage, setServerErrors } from "@/lib/form-errors";
import {
  closureFieldErrors,
  closureNights,
  closurePayload,
  closureUnchanged,
  roomClosureFormSchema,
} from "@/lib/room-closure-form";
import { toast, toastError } from "@/lib/toast";

export type ClosureTarget =
  | {
      mode: "create";
      roomId: string;
      number: string;
      typeName: string;
    }
  | {
      mode: "edit";
      closure: RoomClosure;
      number: string;
      typeName: string;
    };

function formKey(target: ClosureTarget) {
  return target.mode === "edit" ? JSON.stringify(target.closure) : `new-${target.roomId}`;
}

export function RoomActionsMenu({
  number,
  housekeepingStatus,
  onEditRoom,
  onMarkRoom,
  markingRoom,
  onCloseRoom,
}: {
  number: string;
  housekeepingStatus: HousekeepingStatus;
  onEditRoom: () => void;
  /** Sets the other housekeeping status. */
  onMarkRoom: () => void;
  markingRoom: boolean;
  onCloseRoom: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label={`Acciones de habitación ${number}`} />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onEditRoom}>Editar habitación</DropdownMenuItem>
          <DropdownMenuItem onClick={onMarkRoom} disabled={markingRoom}>
            {housekeepingStatus === "dirty" ? "Marcar limpia" : "Marcar sucia"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onCloseRoom} variant="destructive">
            Cerrar habitación
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RoomClosureDialog({
  target,
  onClose,
}: {
  target: ClosureTarget | null;
  onClose: () => void;
}) {
  const save = useSaveRoomClosure();
  const remove = useDeleteRoomClosure();
  const pending = save.isPending || remove.isPending;

  function close() {
    save.reset();
    remove.reset();
    onClose();
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && pending) return;
        if (!next) close();
      }}
    >
      <DialogContent>
        {target ? (
          <ClosureForm
            key={formKey(target)}
            target={target}
            removePending={remove.isPending}
            onSave={async (input) => {
              await save.mutateAsync(input);
              toast.add({
                title: target.mode === "edit" ? "Cierre actualizado" : "Habitación cerrada",
                type: "success",
              });
              close();
            }}
            onRemove={async (id) => {
              try {
                await remove.mutateAsync(id);
                toast.add({ title: "Cierre eliminado", type: "success" });
                close();
              } catch (cause) {
                toastError("No se pudo eliminar el cierre", cause);
              }
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ClosureForm({
  target,
  removePending,
  onSave,
  onRemove,
}: {
  target: ClosureTarget;
  removePending: boolean;
  onSave: (input: {
    id?: string;
    roomId: string;
    starts: string;
    ends: string;
    reason?: string;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      starts: target.mode === "edit" ? target.closure.starts : "",
      ends: target.mode === "edit" ? target.closure.ends : "",
      reason: target.mode === "edit" ? (target.closure.reason ?? "") : "",
    },
    validators: { onSubmit: roomClosureFormSchema },
    onSubmit: async ({ value }) => {
      if (removePending || (target.mode === "edit" && closureUnchanged(target.closure, value)))
        return;
      form.setErrorMap({ onServer: undefined });
      try {
        await onSave({
          id: target.mode === "edit" ? target.closure.id : undefined,
          roomId: target.mode === "edit" ? target.closure.roomId : target.roomId,
          ...closurePayload(value),
        });
      } catch (cause) {
        const fields = closureFieldErrors(cause);
        if (fields) setServerErrors(form, fields);
        else toastError("No se pudo guardar el cierre", cause);
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const pending = submitting || removePending;
  const startDate = values.starts ? parseISO(values.starts) : null;
  const endDate = values.ends ? parseISO(values.ends) : null;
  const nights = closureNights(values.starts, values.ends);
  const unchanged = target.mode === "edit" && closureUnchanged(target.closure, values);

  function clearRangeError() {
    form.setErrorMap({ onServer: undefined });
    form.setFieldMeta("ends", (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: undefined },
    }));
  }

  return (
    <form
      id="room-closure-form"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{target.mode === "edit" ? "Editar cierre" : "Cerrar habitación"}</DialogTitle>
        <DialogDescription>
          {target.number} - {target.typeName}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <FieldGroup>
          <FieldGroup className="grid grid-cols-2 gap-2">
            <form.Field name="starts">
              {(field) => (
                <DateField
                  id="closure-start"
                  label="Desde"
                  value={startDate}
                  locked={pending}
                  error={
                    field.state.meta.isTouched && !field.state.meta.isValid
                      ? errorMessage(field.state.meta.errors)
                      : undefined
                  }
                  onBlur={field.handleBlur}
                  disabled={endDate ? { after: addDays(endDate, -1) } : undefined}
                  onChange={(date) => {
                    clearRangeError();
                    field.handleChange(format(date, "yyyy-MM-dd"));
                  }}
                />
              )}
            </form.Field>
            <form.Field name="ends">
              {(field) => (
                <DateField
                  id="closure-end"
                  label="Reapertura"
                  value={endDate}
                  locked={pending}
                  error={
                    field.state.meta.isTouched && !field.state.meta.isValid
                      ? errorMessage(field.state.meta.errors)
                      : undefined
                  }
                  onBlur={field.handleBlur}
                  disabled={
                    startDate
                      ? [{ before: addDays(startDate, 1) }, { after: addDays(startDate, 60) }]
                      : undefined
                  }
                  onChange={(date) => {
                    clearRangeError();
                    field.handleChange(format(date, "yyyy-MM-dd"));
                  }}
                />
              )}
            </form.Field>
          </FieldGroup>
          <FieldDescription>
            {startDate && endDate && nights >= 1
              ? `${nights} ${nights === 1 ? "noche cerrada" : "noches cerradas"}. Disponible el ${format(endDate, "d MMM yyyy")}.`
              : "Selecciona el inicio del cierre y la fecha de reapertura."}
          </FieldDescription>
        </FieldGroup>
        <form.Field name="reason">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid || undefined} data-disabled={pending || undefined}>
                <FieldLabel htmlFor="closure-reason">Motivo</FieldLabel>
                <Input
                  id="closure-reason"
                  name={field.name}
                  value={field.state.value}
                  maxLength={80}
                  placeholder="Opcional"
                  disabled={pending}
                  aria-invalid={isInvalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {isInvalid && <FieldError>{errorMessage(field.state.meta.errors)}</FieldError>}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <DialogFooter>
        {target.mode === "edit" ? (
          <Button
            type="button"
            variant="destructive"
            className="sm:mr-auto"
            disabled={pending}
            onClick={() => void onRemove(target.closure.id)}
          >
            {removePending ? <Spinner data-icon="inline-start" /> : null}
            Eliminar
          </Button>
        ) : null}
        <DialogClose disabled={pending} render={<Button variant="outline" type="button" />}>
          Cancelar
        </DialogClose>
        <Button
          type="submit"
          disabled={!startDate || !endDate || nights < 1 || nights > 60 || unchanged || pending}
        >
          {submitting ? <Spinner data-icon="inline-start" /> : null}
          {target.mode === "edit" ? "Guardar" : "Cerrar habitación"}
        </Button>
      </DialogFooter>
    </form>
  );
}
