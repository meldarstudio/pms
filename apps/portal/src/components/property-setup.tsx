import { useEffect, useRef, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { Link, useBlocker } from "@tanstack/react-router";
import { BedDoubleIcon, PlusIcon, XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Room, RoomType } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { fieldErrors, setServerErrors } from "@/lib/form-errors";
import { parseMajorToCents } from "@/lib/money";
import { useRooms, useRoomTypes, useSavePropertySetup } from "@/lib/queries";
import { blurThenChange } from "@/lib/reservation-form-state";
import { calendarSearch, lastCalendarSearch } from "@/lib/route-search";
import { setupDefaults, setupFormSchema } from "@/lib/setup-form";
import { toast, toastError } from "@/lib/toast";

export function PropertySetup() {
  const types = useRoomTypes();
  const rooms = useRooms();
  function retry() {
    if (types.error) void types.refetch();
    if (rooms.error) void rooms.refetch();
  }
  if (types.isPending || rooms.isPending) return <Skeleton className="m-6 h-80" />;
  if (!types.data || !rooms.data)
    return (
      <main className="flex flex-col p-6">
        <PageError error={types.error ?? rooms.error} onRetry={retry} />
      </main>
    );
  return (
    <>
      {(types.error || rooms.error) && (
        <div className="px-4 pt-4">
          <StaleDataNotice
            error={types.error ?? rooms.error}
            onRetry={retry}
            detail="Tus cambios sin guardar se conservan."
          />
        </div>
      )}
      <SetupWorkspace types={types.data} rooms={rooms.data} />
    </>
  );
}

function SetupWorkspace({ types, rooms }: { types: RoomType[]; rooms: Room[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(types[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ id: string | null } | null>(null);
  const afterSave = useRef<{ id: string | null } | null>(null);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || saving,
    enableBeforeUnload: () => dirty || saving,
    withResolver: true,
  });
  function stay() {
    setPending(null);
    if (blocker.status === "blocked") blocker.reset();
  }
  const selected = types.find((type) => type.id === selectedId);
  function select(id: string | null) {
    if (id === selectedId) return;
    if (dirty) setPending({ id });
    else setSelectedId(id);
  }
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b p-4 md:w-64 md:overflow-y-auto md:border-r md:border-b-0">
        <h1 className="text-lg font-semibold">Configuración</h1>
        <h2 className="text-sm font-medium">Tipos de habitación</h2>
        <nav aria-label="Tipos de habitación" className="flex flex-col gap-2">
          {types.map((type) => (
            <Button
              key={type.id}
              variant={type.id === selectedId ? "secondary" : "outline"}
              className="justify-start"
              disabled={saving}
              aria-current={type.id === selectedId ? "true" : undefined}
              onClick={() => select(type.id)}
            >
              <BedDoubleIcon data-icon="inline-start" />
              {type.name}
            </Button>
          ))}
        </nav>
        <Button variant="outline" disabled={saving} onClick={() => select(null)}>
          <PlusIcon data-icon="inline-start" />
          Agregar tipo de habitación
        </Button>
        {rooms.length > 0 && (
          <Link
            to="/calendar"
            search={lastCalendarSearch.current ?? calendarSearch({})}
            className={buttonVariants({ variant: "outline" })}
          >
            Ir al calendario
          </Link>
        )}
      </aside>
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto md:p-6">
        <SetupEditor
          key={selectedId ?? "new"}
          type={selected}
          rooms={rooms.filter((room) => room.roomTypeId === selectedId)}
          onSaved={(id) => {
            setSelectedId(afterSave.current ? afterSave.current.id : id);
            afterSave.current = null;
          }}
          onSubmitStart={() => setPending(null)}
          onSubmitFinished={() => {
            afterSave.current = null;
          }}
          onDirtyChange={setDirty}
          onSavingChange={setSaving}
        />
      </div>
      <AlertDialog
        open={pending !== null || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) stay();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {saving ? "Guardando cambios" : "Hay cambios sin guardar"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {saving
                ? "Espera a que termine el guardado antes de salir."
                : "Guarda o descarta los cambios antes de salir de este tipo de habitación."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={stay}>
              Seguir editando
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                if (pending) setSelectedId(pending.id);
                setPending(null);
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Descartar cambios
            </Button>
            {pending && (
              <Button
                type="submit"
                form="property-setup-form"
                disabled={saving}
                onClick={() => {
                  afterSave.current = pending;
                }}
              >
                Guardar y continuar
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function SetupEditor({
  type,
  rooms,
  onSaved,
  onDirtyChange,
  onSavingChange,
  onSubmitStart,
  onSubmitFinished,
}: {
  type?: RoomType;
  rooms: Room[];
  onSaved: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onSubmitStart: () => void;
  onSubmitFinished: () => void;
}) {
  const save = useSavePropertySetup();
  const [saveError, setSaveError] = useState<string>();
  const form = useForm({
    defaultValues: setupDefaults(type, rooms),
    validationLogic: blurThenChange(),
    validators: { onDynamic: setupFormSchema },
    onSubmit: async ({ value }) => {
      setSaveError(undefined);
      form.setErrorMap({ onServer: undefined });
      try {
        const result = await save.mutateAsync({
          ...(type ? { roomTypeId: type.id } : {}),
          name: value.name.trim(),
          maxAdults: Number(value.maxAdults),
          maxChildren: Number(value.maxChildren),
          baseRateCents: parseMajorToCents(value.baseRate)!,
          rooms: value.rooms.map((room) => ({
            ...(room.id ? { id: room.id } : {}),
            number: room.number.trim(),
          })),
        });
        form.reset(setupDefaults(result.roomType, result.rooms));
        onSaved(result.roomType.id);
        toast.add({ title: "Configuración guardada", type: "success" });
      } catch (error) {
        if (error instanceof ApiError && error.code === "room type already exists") {
          setServerErrors(form, { name: error.message });
        } else if (error instanceof ApiError && error.code === "room number already exists") {
          if (error.field && /^rooms\[\d+\]\.number$/.test(error.field))
            setServerErrors(form, { [error.field]: error.message });
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
  const dirty = useSelector(form.store, (state) => state.isDefaultValue === false);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onSavingChange(submitting), [submitting, onSavingChange]);

  function clearServerErrors() {
    form.setErrorMap({ onServer: undefined });
    setSaveError(undefined);
  }

  return (
    <form
      id="property-setup-form"
      className="mx-auto flex max-w-4xl flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmitStart();
        // Existing blur errors can short-circuit handleSubmit before other
        // fields validate. Show every current issue on each save attempt.
        void Promise.resolve(form.validate("submit"))
          .then(() => form.handleSubmit())
          .finally(onSubmitFinished);
      }}
    >
      <header>
        <h2 className="text-xl font-semibold">{type?.name ?? "Nuevo tipo de habitación"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define el tipo y agrega sus habitaciones para empezar a recibir reservas.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Detalles del tipo de habitación</CardTitle>
          <CardDescription>Tarifa por noche y capacidad por habitación.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <form.Field name="name">
              {(field) => (
                <Field
                  data-invalid={!field.state.meta.isValid || undefined}
                  data-disabled={submitting || undefined}
                >
                  <FieldLabel htmlFor="setup-name">Nombre</FieldLabel>
                  <Input
                    id="setup-name"
                    name={field.name}
                    value={field.state.value}
                    maxLength={80}
                    disabled={submitting}
                    aria-invalid={!field.state.meta.isValid}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      clearServerErrors();
                      field.handleChange(event.target.value);
                    }}
                  />
                  <FieldError errors={fieldErrors(field.state.meta.errors)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="baseRate">
              {(field) => (
                <Field
                  data-invalid={!field.state.meta.isValid || undefined}
                  data-disabled={submitting || undefined}
                >
                  <FieldLabel htmlFor="setup-rate">Tarifa base (S/)</FieldLabel>
                  <Input
                    id="setup-rate"
                    name={field.name}
                    inputMode="decimal"
                    value={field.state.value}
                    disabled={submitting}
                    aria-invalid={!field.state.meta.isValid}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      clearServerErrors();
                      field.handleChange(event.target.value);
                    }}
                  />
                  <FieldDescription>
                    Por noche. Los precios de las noches ya guardadas no cambian; las tarifas por
                    fecha tienen prioridad.
                  </FieldDescription>
                  <FieldError errors={fieldErrors(field.state.meta.errors)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="maxAdults">
              {(field) => (
                <Field
                  data-invalid={!field.state.meta.isValid || undefined}
                  data-disabled={submitting || undefined}
                >
                  <FieldLabel htmlFor="setup-adults">Máximo de adultos</FieldLabel>
                  <Input
                    id="setup-adults"
                    name={field.name}
                    type="number"
                    min={1}
                    step={1}
                    value={field.state.value}
                    disabled={submitting}
                    aria-invalid={!field.state.meta.isValid}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      clearServerErrors();
                      field.handleChange(event.target.value);
                    }}
                  />
                  <FieldDescription>
                    Los niños tienen un límite separado. Reducir los límites no invalida reservas
                    sin cambios; los cambios posteriores se validan con los nuevos límites.
                  </FieldDescription>
                  <FieldError errors={fieldErrors(field.state.meta.errors)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="maxChildren">
              {(field) => (
                <Field
                  data-invalid={!field.state.meta.isValid || undefined}
                  data-disabled={submitting || undefined}
                >
                  <FieldLabel htmlFor="setup-children">Máximo de niños</FieldLabel>
                  <Input
                    id="setup-children"
                    name={field.name}
                    type="number"
                    min={0}
                    step={1}
                    value={field.state.value}
                    disabled={submitting}
                    aria-invalid={!field.state.meta.isValid}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      clearServerErrors();
                      field.handleChange(event.target.value);
                    }}
                  />
                  <FieldDescription>
                    Adicionales a los adultos. La tarifa es por habitación, no por huésped. Usa 0 si
                    este tipo no admite niños.
                  </FieldDescription>
                  <FieldError errors={fieldErrors(field.state.meta.errors)} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Habitaciones</CardTitle>
          <CardDescription>Cada número debe ser único en todo el alojamiento.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número de habitación</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {values.rooms.map((room, index) => (
                <TableRow key={room.key}>
                  <TableCell>
                    <form.Field name={`rooms[${index}].number`}>
                      {(field) => (
                        <Field
                          data-invalid={!field.state.meta.isValid || undefined}
                          data-disabled={submitting || undefined}
                        >
                          <FieldLabel className="sr-only" htmlFor={`setup-room-${room.key}`}>
                            Número de habitación {index + 1}
                          </FieldLabel>
                          <Input
                            id={`setup-room-${room.key}`}
                            name={field.name}
                            value={field.state.value}
                            maxLength={20}
                            disabled={submitting}
                            aria-invalid={!field.state.meta.isValid}
                            autoComplete="off"
                            onBlur={field.handleBlur}
                            onChange={(event) => {
                              clearServerErrors();
                              field.handleChange(event.target.value);
                            }}
                          />
                          <FieldError errors={fieldErrors(field.state.meta.errors)} />
                        </Field>
                      )}
                    </form.Field>
                  </TableCell>
                  <TableCell className="w-10">
                    {!room.id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar fila ${index + 1}`}
                        disabled={submitting}
                        onClick={() => {
                          clearServerErrors();
                          void form.removeFieldValue("rooms", index);
                        }}
                      >
                        <XIcon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!values.rooms.length && (
                <TableRow>
                  <TableCell colSpan={2}>
                    Aún no hay habitaciones. Agrega una fila por cada número.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => form.pushFieldValue("rooms", { key: crypto.randomUUID(), number: "" })}
          >
            <PlusIcon data-icon="inline-start" />
            Agregar habitación
          </Button>
        </CardFooter>
      </Card>
      {saveError && <FieldError>{saveError}</FieldError>}
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting || !dirty}>
          {submitting && <Spinner data-icon="inline-start" />}Guardar cambios
        </Button>
      </div>
    </form>
  );
}
