import { defaultValidationLogic, useForm, useSelector } from "@tanstack/react-form";

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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { usePatchRoom, useRoomTypes } from "@/lib/queries";
import {
  clearServerErrorsOnlyOnOwnChangeOrSubmit,
  fieldErrors,
  setServerErrors,
} from "@/lib/form-errors";
import { roomEditSchema, roomFieldErrors, roomPatch } from "@/lib/room-form";
import { toast, toastError } from "@/lib/toast";

export type RoomEditTarget = {
  roomId: string;
  number: string;
  roomTypeId: string;
  typeName: string;
};

export function RoomEditDialog({
  target,
  onClose,
}: {
  target: RoomEditTarget | null;
  onClose: () => void;
}) {
  const save = usePatchRoom();

  function close() {
    save.reset();
    onClose();
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && save.isPending) return;
        if (!next) close();
      }}
    >
      <DialogContent>
        {target ? (
          <RoomEditForm
            key={`${target.roomId}-${target.number}-${target.roomTypeId}`}
            target={target}
            onSave={async (input) => {
              await save.mutateAsync(input);
              toast.add({ title: "Habitación actualizada", type: "success" });
              close();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RoomEditForm({
  target,
  onSave,
}: {
  target: RoomEditTarget;
  onSave: (input: { id: string; number?: string; roomTypeId?: string }) => Promise<void>;
}) {
  const typesQuery = useRoomTypes();
  const types = typesQuery.data ?? [];
  const typeItems = types.some((type) => type.id === target.roomTypeId)
    ? types.map((type) => ({ value: type.id, label: type.name }))
    : [
        { value: target.roomTypeId, label: target.typeName },
        ...types.map((type) => ({ value: type.id, label: type.name })),
      ];
  const form = useForm({
    validationLogic: clearServerErrorsOnlyOnOwnChangeOrSubmit(defaultValidationLogic),
    defaultValues: {
      number: target.number,
      roomTypeId: target.roomTypeId,
    },
    validators: {
      onSubmit: roomEditSchema,
    },
    onSubmit: async ({ value }) => {
      const patch = roomPatch(target, value);
      if (!patch) return;
      form.setErrorMap({ onServer: undefined });
      try {
        await onSave({ id: target.roomId, ...patch });
      } catch (cause) {
        const fields = roomFieldErrors(cause);
        if (fields) setServerErrors(form, fields);
        else toastError("No se pudo guardar la habitación", cause);
      }
    },
  });
  const number = useSelector(form.store, (state) => state.values.number);
  const roomTypeId = useSelector(form.store, (state) => state.values.roomTypeId);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const unchanged = number.trim() === target.number && roomTypeId === target.roomTypeId;

  return (
    <form
      id="room-edit-form"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Editar habitación</DialogTitle>
        <DialogDescription>
          {target.number} - {target.typeName}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <form.Field name="number">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid || undefined} data-disabled={submitting || undefined}>
                <FieldLabel htmlFor={field.name}>Número</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  maxLength={20}
                  disabled={submitting}
                  aria-invalid={isInvalid}
                  autoComplete="off"
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    if (field.state.meta.errorMap.onServer)
                      field.setMeta((meta) => ({
                        ...meta,
                        errorMap: { ...meta.errorMap, onServer: undefined },
                      }));
                    field.handleChange(event.target.value);
                  }}
                />
                {isInvalid && <FieldError errors={fieldErrors(field.state.meta.errors)} />}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="roomTypeId">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            const disabled = submitting || typesQuery.isPending;
            return (
              <Field data-invalid={isInvalid || undefined} data-disabled={disabled || undefined}>
                <FieldLabel htmlFor={field.name}>Tipo</FieldLabel>
                <Select
                  items={typeItems}
                  name={field.name}
                  value={field.state.value}
                  disabled={disabled}
                  onValueChange={(value) => {
                    if (!value) return;
                    if (field.state.meta.errorMap.onServer)
                      field.setMeta((meta) => ({
                        ...meta,
                        errorMap: { ...meta.errorMap, onServer: undefined },
                      }));
                    field.handleChange(value);
                  }}
                >
                  <SelectTrigger
                    id={field.name}
                    className="w-full"
                    aria-invalid={isInvalid}
                    onBlur={field.handleBlur}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {typeItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {isInvalid && <FieldError errors={fieldErrors(field.state.meta.errors)} />}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose disabled={submitting} render={<Button variant="outline" type="button" />}>
          Cancelar
        </DialogClose>
        <Button
          type="submit"
          form="room-edit-form"
          disabled={!number.trim() || unchanged || submitting}
        >
          {submitting ? <Spinner data-icon="inline-start" /> : null}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
