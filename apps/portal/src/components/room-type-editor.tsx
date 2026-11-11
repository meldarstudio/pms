import { Fragment, useRef, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { PlusIcon, XIcon } from "lucide-react";
import {
  useReportEditorState,
  type ConfigurationEditorEvents,
} from "@/components/configuration-draft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { Room, RoomType } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { fieldErrors, setServerErrors } from "@/lib/form-errors";
import { parseMajorToCents } from "@/lib/money";
import { useSavePropertySetup } from "@/lib/queries";
import { blurThenChange } from "@/lib/reservation-form-state";
import { setupDefaults, setupFormSchema, type SetupValues } from "@/lib/setup-form";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";

type RoomTypeDraft = SetupValues & { roomNumber: string };

function withPendingRoom(value: RoomTypeDraft): SetupValues {
  const number = value.roomNumber.trim();
  return {
    ...value,
    rooms: number ? [{ key: "pending-room", number }, ...value.rooms] : value.rooms,
  };
}

function draftRoomField(index: number, pending: boolean) {
  return pending && index === 0 ? "roomNumber" : `rooms[${index - (pending ? 1 : 0)}].number`;
}

const fields = [
  {
    key: "name",
    label: "Nombre",
    detail: "Cómo se identifica este tipo en el portal.",
    type: "text",
    maxLength: 80,
  },
  {
    key: "baseRate",
    label: "Tarifa base (S/)",
    detail:
      "Por habitación y noche, no por persona. No cambia precios guardados; las tarifas por fecha tienen prioridad.",
    type: "text",
  },
  {
    key: "maxAdults",
    label: "Máximo de adultos",
    detail: "Límite de adultos por habitación. Reducirlo no invalida reservas sin cambios.",
    type: "number",
    min: 1,
  },
  {
    key: "maxChildren",
    label: "Máximo de niños",
    detail: "Independiente del límite de adultos. Usa 0 si este tipo no admite niños.",
    type: "number",
    min: 0,
  },
] as const;

export function RoomTypeEditor({
  type,
  rooms,
  allRooms,
  onTypeSaved,
  ...events
}: {
  type?: RoomType;
  rooms: Room[];
  allRooms: Room[];
  onTypeSaved: (type: RoomType, rooms: Room[]) => void;
} & ConfigurationEditorEvents) {
  const save = useSavePropertySetup();
  const input = useRef<HTMLInputElement>(null);
  const nextRoomKey = useRef(0);
  const [saveError, setSaveError] = useState<string>();
  const otherNumbers = new Set(
    allRooms.filter((room) => room.roomTypeId !== type?.id).map((room) => room.number),
  );
  const form = useForm({
    defaultValues: { ...setupDefaults(type, rooms), roomNumber: "" },
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const proposed = withPendingRoom(value);
        const parsed = setupFormSchema.safeParse(proposed);
        const errors: Record<string, string> = {};
        for (const issue of parsed.error?.issues ?? []) {
          const field =
            issue.path[0] === "rooms" && typeof issue.path[1] === "number"
              ? draftRoomField(issue.path[1], !!value.roomNumber.trim())
              : String(issue.path[0]);
          errors[field] ??= issue.message;
        }
        proposed.rooms.forEach((room, index) => {
          if (otherNumbers.has(room.number.trim()))
            errors[draftRoomField(index, !!value.roomNumber.trim())] =
              "Este número de habitación ya está en uso.";
        });
        return Object.keys(errors).length ? { fields: errors } : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      clearServerErrors();
      const proposed = withPendingRoom(value);
      try {
        const result = await save.mutateAsync({
          ...(type ? { roomTypeId: type.id } : {}),
          name: proposed.name.trim(),
          maxAdults: Number(proposed.maxAdults),
          maxChildren: Number(proposed.maxChildren),
          baseRateCents: parseMajorToCents(proposed.baseRate)!,
          rooms: proposed.rooms.map((room) => ({
            ...(room.id ? { id: room.id } : {}),
            number: room.number.trim(),
          })),
        });
        form.reset({ ...setupDefaults(result.roomType, result.rooms), roomNumber: "" });
        onTypeSaved(result.roomType, result.rooms);
        events.onSaved();
        toast.success("Configuración guardada");
      } catch (error) {
        if (error instanceof ApiError && error.code === "room type already exists")
          setServerErrors(form, { name: error.message });
        else if (error instanceof ApiError && error.code === "room number already exists") {
          const index = error.field?.match(/^rooms\[(\d+)\]\.number$/)?.[1];
          if (index !== undefined)
            setServerErrors(form, {
              [draftRoomField(Number(index), !!value.roomNumber.trim())]: error.message,
            });
          else setSaveError(error.message);
        } else {
          setSaveError(
            error instanceof Error ? error.message : "No se pudo guardar la configuración.",
          );
          toastError("No se pudo guardar la configuración", error);
        }
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const dirty = useSelector(form.store, (state) => !state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  useReportEditorState(events, dirty, submitting);
  function clearServerErrors() {
    setServerErrors(form, {});
    setSaveError(undefined);
  }
  const number = values.roomNumber.trim();
  const numberError =
    number.length > 20
      ? "Máximo 20 caracteres."
      : number &&
          (otherNumbers.has(number) || values.rooms.some((room) => room.number.trim() === number))
        ? "Este número de habitación ya está en uso o repetido."
        : undefined;
  function add() {
    if (submitting || !number || numberError) return;
    clearServerErrors();
    form.setFieldValue("rooms", [
      { key: `new-room-${nextRoomKey.current++}`, number },
      ...values.rooms,
    ]);
    form.setFieldValue("roomNumber", "");
    input.current?.focus();
  }
  return (
    <form
      id="property-setup-form"
      className="flex min-w-0 flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (submitting) return;
        void Promise.resolve(form.validate("submit"))
          .then(() => form.handleSubmit())
          .finally(events.onSubmitFinished);
      }}
    >
      <div className="border bg-muted/15 px-4 sm:px-6">
        <FieldGroup className="gap-0">
          {fields.map((item, index) => (
            <Fragment key={item.key}>
              {index > 0 && <Separator />}
              <form.Field name={item.key}>
                {(field) => (
                  <Field
                    orientation="responsive"
                    className="py-5 @md/field-group:gap-6"
                    data-invalid={!field.state.meta.isValid}
                    data-disabled={submitting}
                  >
                    <FieldContent className="min-w-0">
                      <FieldLabel htmlFor={`setup-${item.key}`}>{item.label}</FieldLabel>
                      <FieldDescription id={`setup-${item.key}-help`} className="max-w-md">
                        {item.detail}
                      </FieldDescription>
                      <FieldError
                        id={`setup-${item.key}-error`}
                        errors={fieldErrors(field.state.meta.errors)}
                      />
                    </FieldContent>
                    <Input
                      id={`setup-${item.key}`}
                      name={field.name}
                      className="w-full @md/field-group:basis-56 @md/field-group:shrink-0"
                      type={item.type}
                      inputMode={item.key === "baseRate" ? "decimal" : undefined}
                      min={"min" in item ? item.min : undefined}
                      step={item.type === "number" ? 1 : undefined}
                      maxLength={"maxLength" in item ? item.maxLength : undefined}
                      value={field.state.value}
                      disabled={submitting}
                      aria-invalid={!field.state.meta.isValid}
                      aria-describedby={`setup-${item.key}-help setup-${item.key}-error`}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        clearServerErrors();
                        field.handleChange(event.target.value);
                      }}
                    />
                  </Field>
                )}
              </form.Field>
            </Fragment>
          ))}
        </FieldGroup>
      </div>
      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="room-numbers-title">
        <header className="flex flex-col gap-2">
          <h2 id="room-numbers-title" className="text-sm font-medium">
            Números de habitación
          </h2>
          <p className="text-xs text-muted-foreground">
            Agrega o edita los números. Todo se guarda junto con el tipo.
          </p>
        </header>
        <FieldGroup>
          <form.Field name="roomNumber">
            {(field) => {
              const error = numberError || fieldErrors(field.state.meta.errors)[0]?.message;
              return (
                <Field data-invalid={!!error} data-disabled={submitting}>
                  <FieldLabel htmlFor="add-room-number">Número de habitación</FieldLabel>
                  <div className="flex min-w-0 items-start gap-2">
                    <Input
                      ref={input}
                      id="add-room-number"
                      name={field.name}
                      className="min-w-0 flex-1 sm:max-w-48"
                      value={field.state.value}
                      maxLength={20}
                      placeholder="Ej. 201"
                      autoComplete="off"
                      disabled={submitting}
                      aria-invalid={!!error}
                      aria-describedby="add-room-help add-room-error"
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        clearServerErrors();
                        field.handleChange(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          add();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={add}
                      disabled={submitting || !number || !!numberError}
                      aria-label="Agregar habitación"
                    >
                      <PlusIcon data-icon="inline-start" />
                      Agregar
                    </Button>
                  </div>
                  <FieldDescription id="add-room-help">
                    Pulsa Enter para agregar y seguir con el siguiente. Guardar cambios también
                    incluye el número que estés escribiendo.
                  </FieldDescription>
                  {error && <FieldError id="add-room-error">{error}</FieldError>}
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
        <h3 className="text-xs font-medium" aria-live="polite">
          Habitaciones de este tipo ({values.rooms.length})
        </h3>
        {values.rooms.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Sin habitaciones todavía</EmptyTitle>
              <EmptyDescription>
                Agrega la primera arriba o guarda el tipo sin habitaciones.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <FieldGroup
            className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2"
            aria-label="Números de habitación · cuadrícula compacta"
          >
            {values.rooms.map((room, index) => (
              <form.Field key={room.key} name={`rooms[${index}].number`}>
                {(field) => (
                  <Field
                    className="min-w-0"
                    data-invalid={!field.state.meta.isValid}
                    data-disabled={submitting}
                  >
                    <FieldLabel className="sr-only" htmlFor={`setup-room-${room.key}`}>
                      Habitación {index + 1}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`setup-room-${room.key}`}
                        name={field.name}
                        value={field.state.value}
                        maxLength={20}
                        placeholder="Número"
                        autoComplete="off"
                        disabled={submitting}
                        aria-invalid={!field.state.meta.isValid}
                        aria-describedby={`setup-room-${room.key}-error${!room.id ? ` setup-room-${room.key}-new` : ""}`}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          clearServerErrors();
                          field.handleChange(event.target.value);
                        }}
                      />
                      {!room.id && (
                        <InputGroupAddon align="inline-end" className="gap-1">
                          <Badge id={`setup-room-${room.key}-new`} variant="secondary" size="sm">
                            Nueva
                          </Badge>
                          <InputGroupButton
                            size="icon-xs"
                            aria-label={`Quitar habitación nueva ${index + 1}`}
                            disabled={submitting}
                            onClick={() => {
                              clearServerErrors();
                              void form.removeFieldValue("rooms", index);
                              input.current?.focus();
                            }}
                          >
                            <XIcon />
                          </InputGroupButton>
                        </InputGroupAddon>
                      )}
                    </InputGroup>
                    <FieldError
                      id={`setup-room-${room.key}-error`}
                      errors={fieldErrors(field.state.meta.errors)}
                    />
                  </Field>
                )}
              </form.Field>
            ))}
          </FieldGroup>
        )}
      </section>
      {saveError && <FieldError role="alert">{saveError}</FieldError>}
      <Separator />
      <footer className="flex flex-wrap items-center justify-end gap-2 max-sm:[&>button]:flex-1">
        <p role="status" className="mr-auto text-xs text-muted-foreground max-sm:w-full">
          {dirty ? "Cambios sin guardar" : "Sin cambios"}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || submitting}
          onClick={() => {
            form.reset();
            clearServerErrors();
          }}
        >
          Descartar
        </Button>
        <Button type="submit" disabled={!dirty || submitting}>
          {submitting && <Spinner data-icon="inline-start" />}Guardar cambios
        </Button>
      </footer>
    </form>
  );
}
