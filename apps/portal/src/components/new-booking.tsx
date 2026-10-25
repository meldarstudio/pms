import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { BedDoubleIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { BookingSummary } from "@/components/booking-summary";
import type { BookingTarget } from "@/components/room-booking-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { createWorkflowBooking } from "@/lib/api";
import { serverFieldErrors } from "@/lib/api-error";
import { format } from "@/lib/dates";
import { parseISO } from "date-fns";
import { setServerErrors } from "@/lib/form-errors";
import { CURRENCY, formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import { newBookingAvailability } from "@/lib/new-booking-availability";
import {
  useAvailability,
  useReservations,
  useRoomClosures,
  useRooms,
  useRoomTypes,
} from "@/lib/queries";
import { changeCheckIn, minimumCheckOut, unavailableRoomIds } from "@/lib/reservation-editor";
import { blurThenChange, submitForm, useReservationForm } from "@/lib/reservation-form";
import {
  newBookingSchema,
  schemaErrors,
  workflowDrafts,
  type NewBookingValues,
} from "@/lib/reservation-form-schemas";
import { propertyToday } from "@/lib/property-calendar";

export function NewBooking({
  target,
  onCreated,
  onCancel,
  onDirtyChange,
  onSavingChange,
}: {
  target: Exclude<BookingTarget, { mode: "edit" }>;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const client = useQueryClient();
  const roomTypes = useRoomTypes();
  const rooms = useRooms();
  const schema = useMemo(() => newBookingSchema(roomTypes.data ?? []), [roomTypes.data]);
  const [defaults] = useState<NewBookingValues>(() => {
    const checkIn = target.mode === "create" ? target.checkIn : propertyToday();
    return {
      checkIn,
      checkOut: minimumCheckOut(checkIn),
      status: "confirmed",
      fullName: "",
      email: "",
      phone: "",
      notes: "",
      discount: "0",
      rooms: [
        {
          id: crypto.randomUUID(),
          removed: false,
          room: {
            roomTypeId: target.mode === "create" ? target.roomTypeId : "",
            roomId: target.mode === "create" ? target.roomId : null,
            adults: "1",
            children: "0",
          },
        },
      ],
    };
  });
  const [error, setError] = useState("");
  const [discountDirty, setDiscountDirty] = useState(false);
  const retry = useRef<{ payload: string; requestId: string } | null>(null);
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      if (!availabilityReady || selection.rooms !== values.rooms) return;
      setError("");
      const parsed = schema.parse(value);
      const data = {
        guest: {
          fullName: parsed.fullName,
          ...(parsed.phone ? { phone: parsed.phone } : {}),
          ...(parsed.email ? { email: parsed.email } : {}),
        },
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        rooms: workflowDrafts(parsed).map((draft) => draft.room),
        notes: parsed.notes,
        discountCents: parseMajorToCents(parsed.discount.trim() || "0")!,
      };
      const payload = JSON.stringify(data);
      if (retry.current?.payload !== payload)
        retry.current = { payload, requestId: crypto.randomUUID() };
      try {
        const result = await createWorkflowBooking({
          ...data,
          requestId: retry.current!.requestId,
        });
        await client.invalidateQueries();
        onDirtyChange(false);
        onCreated(result.id);
      } catch (cause) {
        const fields = serverFieldErrors(cause, "details") ?? serverFieldErrors(cause, "guest");
        if (fields) setServerErrors(form, fields);
        else setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const busy = useSelector(form.store, (state) => state.isSubmitting);
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);
  useEffect(
    () => onDirtyChange(!unchanged || discountDirty),
    [unchanged, discountDirty, onDirtyChange],
  );
  useEffect(() => {
    onSavingChange(busy);
    return () => onSavingChange(false);
  }, [busy, onSavingChange]);

  const nights =
    (Date.parse(`${values.checkOut}T00:00:00Z`) - Date.parse(`${values.checkIn}T00:00:00Z`)) /
    86400000;
  const validStay = nights >= 1 && nights <= 60;
  const availability = useAvailability(values.checkIn, values.checkOut, validStay);
  const reservations = useReservations(values.checkIn, values.checkOut, validStay);
  const closures = useRoomClosures(values.checkIn, values.checkOut, validStay);
  const availabilityReady =
    validStay &&
    roomTypes.isSuccess &&
    rooms.isSuccess &&
    availability.isSuccess &&
    reservations.isSuccess &&
    !reservations.isPlaceholderData &&
    closures.isSuccess &&
    !closures.isPlaceholderData;
  const selection = newBookingAvailability(
    values.rooms,
    availability.data?.roomTypes ?? [],
    rooms.data ?? [],
    unavailableRoomIds(
      { checkIn: values.checkIn, checkOut: values.checkOut },
      reservations.data ?? [],
      closures.data ?? [],
    ),
  );
  useEffect(() => {
    if (availabilityReady && !busy && selection.rooms !== values.rooms)
      form.setFieldValue("rooms", selection.rooms);
  }, [availabilityReady, busy, selection.rooms, values.rooms, form]);
  const setupMessage =
    roomTypes.isSuccess && roomTypes.data.length === 0
      ? "Aún no hay tipos de habitación. Agrégalos en Configuración."
      : roomTypes.isSuccess && rooms.isSuccess && rooms.data.length === 0
        ? "Aún no hay habitaciones. Agrégalas en Configuración."
        : null;
  const noAvailability =
    !setupMessage &&
    availabilityReady &&
    availability.data.roomTypes.length > 0 &&
    availability.data.roomTypes.every((type) => type.free === 0);
  const errors = schemaErrors(schema.safeParse(values));
  const summaryRooms = values.rooms.map((draft) => {
    const type = availability.data?.roomTypes.find((type) => type.id === draft.room.roomTypeId);
    return {
      key: draft.id,
      typeName:
        roomTypes.data?.find((type) => type.id === draft.room.roomTypeId)?.name ??
        "Selecciona un tipo",
      adults: /^\d+$/.test(draft.room.adults) ? Number(draft.room.adults) : null,
      children: /^\d+$/.test(draft.room.children) ? Number(draft.room.children) : null,
      charges:
        validStay && !availability.isError && type
          ? {
              subtotalCents: type.totalCents,
              discountCents: 0,
              totalCents: type.totalCents,
            }
          : null,
    };
  });
  const subtotalCents = summaryRooms.reduce(
    (sum, room) => sum + (room.charges?.totalCents ?? 0),
    0,
  );
  const discountCents = parseMajorToCents(values.discount.trim() || "0") ?? 0;
  const priced = summaryRooms.every((room) => room.charges !== null);
  const appliedDiscountCents = Math.min(discountCents, subtotalCents);
  const totalCents = subtotalCents - appliedDiscountCents;
  const currency = availability.data?.currency ?? CURRENCY;

  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-5 max-md:min-h-0 max-md:flex-1 max-md:gap-0"
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      <div className="flex min-w-0 flex-col gap-5 max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:scroll-py-4 max-md:pb-6 max-md:safe-area-padding-x">
        <fieldset disabled={busy} className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-5">
            <FieldSet>
              <FieldLegend className="md:sr-only">Estadía</FieldLegend>
              <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <form.AppField
                  name="checkIn"
                  listeners={{
                    onChange: ({ value }) => {
                      form.setFieldValue(
                        "checkOut",
                        changeCheckIn(
                          {
                            checkIn: value,
                            checkOut: form.getFieldValue("checkOut"),
                          },
                          value,
                        ).checkOut,
                      );
                    },
                  }}
                >
                  {(field) => <field.Text label="Check-in" type="date" required />}
                </form.AppField>
                <form.AppField name="checkOut">
                  {(field) => (
                    <field.Text
                      label="Check-out"
                      type="date"
                      required
                      min={minimumCheckOut(values.checkIn)}
                    />
                  )}
                </form.AppField>
              </FieldGroup>
            </FieldSet>
            <section className="flex flex-col gap-3" aria-label="Habitaciones">
              <h3 className="font-medium">Habitaciones</h3>
              {noAvailability ? (
                <Empty variant="input" role="status">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <BedDoubleIcon />
                    </EmptyMedia>
                    <EmptyTitle>Sin habitaciones disponibles</EmptyTitle>
                    <EmptyDescription>
                      Prueba con otras fechas para encontrar disponibilidad.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <form.Field name="rooms" mode="array">
                    {() =>
                      values.rooms.map((draft, index) => {
                        const options = selection.options[index];
                        const capacity = errors[`rooms[${index}].room`];
                        const titleId = `${draft.id}-title`;
                        const roomRemoval = {
                          label: `Quitar habitación ${index + 1}`,
                          onClick: () => form.removeFieldValue("rooms", index),
                        };
                        return (
                          <section
                            key={draft.id}
                            aria-labelledby={values.rooms.length > 1 ? titleId : undefined}
                            aria-label={values.rooms.length === 1 ? "Habitación" : undefined}
                            className="flex min-w-0 flex-col gap-3"
                          >
                            {index > 0 && <Separator className="my-2 md:hidden" />}
                            {values.rooms.length > 1 && (
                              <div className="flex items-center justify-between gap-3 md:hidden">
                                <h4 id={titleId} className="font-medium text-muted-foreground">
                                  Habitación {index + 1}
                                </h4>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  aria-label={roomRemoval.label}
                                  onClick={roomRemoval.onClick}
                                >
                                  <Trash2Icon data-icon="inline-start" />
                                  Quitar
                                </Button>
                              </div>
                            )}
                            <FieldGroup className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_88px_56px_56px_28px]">
                              <div className="col-span-full min-w-0 md:col-span-1">
                                <form.AppField name={`rooms[${index}].room.roomTypeId`}>
                                  {(field) => (
                                    <field.Choice
                                      label="Tipo"
                                      placeholder="Selecciona un tipo"
                                      disabled={!availabilityReady}
                                      options={
                                        availabilityReady
                                          ? options.types
                                          : (roomTypes.data ?? []).map((type) => ({
                                              value: type.id,
                                              label: type.name,
                                            }))
                                      }
                                      onValueChange={() =>
                                        form.setFieldValue(`rooms[${index}].room.roomId`, null)
                                      }
                                    />
                                  )}
                                </form.AppField>
                              </div>
                              <div className="col-span-full min-w-0 md:col-span-1">
                                <form.AppField name={`rooms[${index}].room.roomId`}>
                                  {(field) => (
                                    <field.Choice
                                      label="Hab."
                                      nullable
                                      disabled={!availabilityReady || !draft.room.roomTypeId}
                                      options={[
                                        { value: "none", label: "Sin asignar" },
                                        ...(availabilityReady
                                          ? options.numbers
                                          : (rooms.data ?? [])
                                              .filter(
                                                (room) => room.roomTypeId === draft.room.roomTypeId,
                                              )
                                              .map((room) => ({
                                                value: room.id,
                                                label: room.number,
                                              }))),
                                      ]}
                                    />
                                  )}
                                </form.AppField>
                              </div>
                              <form.AppField name={`rooms[${index}].room.adults`}>
                                {(field) => (
                                  <field.Text
                                    label="Adultos"
                                    type="number"
                                    min={1}
                                    max={100}
                                    required
                                    live
                                    groupErrorId={capacity ? `${draft.id}-capacity` : undefined}
                                  />
                                )}
                              </form.AppField>
                              <form.AppField name={`rooms[${index}].room.children`}>
                                {(field) => (
                                  <field.Text
                                    label="Niños"
                                    type="number"
                                    min={0}
                                    max={100}
                                    required
                                    live
                                    groupErrorId={capacity ? `${draft.id}-capacity` : undefined}
                                  />
                                )}
                              </form.AppField>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="hidden self-end justify-self-end md:inline-flex"
                                aria-label={roomRemoval.label}
                                disabled={values.rooms.length === 1}
                                onClick={roomRemoval.onClick}
                              >
                                <XIcon />
                              </Button>
                              {capacity && (
                                <FieldError id={`${draft.id}-capacity`} className="col-span-full">
                                  {capacity}
                                </FieldError>
                              )}
                            </FieldGroup>
                          </section>
                        );
                      })
                    }
                  </form.Field>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    disabled={!availabilityReady || !selection.canAdd}
                    onClick={() => {
                      const lastRoom = values.rooms[values.rooms.length - 1].room;
                      const type = availability.data?.roomTypes.find(
                        (type) => type.id === lastRoom.roomTypeId,
                      );
                      const used = values.rooms.filter(
                        (draft) => draft.room.roomTypeId === lastRoom.roomTypeId,
                      ).length;
                      form.pushFieldValue("rooms", {
                        id: crypto.randomUUID(),
                        removed: false,
                        room: {
                          ...lastRoom,
                          roomTypeId: type && type.free > used ? lastRoom.roomTypeId : "",
                          roomId: null,
                        },
                      });
                    }}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Agregar habitación
                  </Button>
                  {errors.rooms && <FieldError>{errors.rooms}</FieldError>}
                  {setupMessage && (
                    <p role="status" className="text-muted-foreground">
                      {setupMessage}
                    </p>
                  )}
                </>
              )}
            </section>
            <FieldSet>
              <FieldLegend>Contacto principal</FieldLegend>
              <FieldGroup>
                <form.AppField name="fullName">
                  {(field) => (
                    <field.Text label="Nombre completo" placeholder="Nombre y apellidos" required />
                  )}
                </form.AppField>
                <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <form.AppField name="email">
                    {(field) => (
                      <field.Text
                        label="Correo · Opcional"
                        type="email"
                        placeholder="correo@ejemplo.com"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="phone">
                    {(field) => (
                      <field.Text label="Teléfono · Opcional" type="tel" placeholder="+51" />
                    )}
                  </form.AppField>
                </FieldGroup>
              </FieldGroup>
            </FieldSet>
            <FieldGroup>
              <form.AppField name="notes">
                {(field) => (
                  <field.Text
                    label="Notas · Opcional"
                    type="textarea"
                    max={2000}
                    placeholder="Solicitudes especiales o detalles de la reserva"
                  />
                )}
              </form.AppField>
            </FieldGroup>
          </div>
          <aside className="flex min-w-0 flex-col gap-3 lg:self-start">
            <BookingSummary
              cancelled={false}
              rooms={summaryRooms}
              summary={
                priced
                  ? {
                      subtotalCents,
                      discountCents: appliedDiscountCents,
                      totalCents,
                      balanceCents: totalCents,
                    }
                  : null
              }
              paidCents={0}
              currency={currency}
              editableDiscountCents={discountCents}
              discountDisabled={busy}
              onDiscountSave={async (cents) => form.setFieldValue("discount", formatMajor(cents))}
              onDiscountDirtyChange={setDiscountDirty}
              stayLabel={
                validStay
                  ? `${format(parseISO(values.checkIn), "d MMM")} – ${format(parseISO(values.checkOut), "d MMM yyyy")}`
                  : null
              }
              showPayments={false}
              message={
                !validStay
                  ? "Indica una estancia de 1 a 60 noches."
                  : availability.isPending
                    ? "Calculando…"
                    : "Selecciona los tipos de habitación para ver el total."
              }
            />
            {[roomTypes, rooms, availability, reservations, closures].map((query, index) =>
              query.error ? (
                <div key={index} className="flex flex-col items-start gap-2">
                  <FieldError>{query.error.message}</FieldError>
                  <Button type="button" variant="outline" onClick={() => void query.refetch()}>
                    Reintentar
                  </Button>
                </div>
              ) : null,
            )}
          </aside>
        </fieldset>
        <FieldError>{error}</FieldError>
      </div>
      <Separator className="shrink-0" />
      <div className="flex shrink-0 flex-col gap-3 max-md:py-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:safe-area-padding-x">
        <dl
          aria-label="Total de la nueva reserva"
          className="flex items-baseline justify-between gap-3 md:hidden"
        >
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-sm font-semibold tabular-nums">
            {availability.isFetching
              ? "Calculando…"
              : priced
                ? formatMoney(totalCents, currency)
                : "—"}
          </dd>
        </dl>
        {discountDirty && (
          <p role="status" className="text-muted-foreground md:hidden">
            Termina de editar el descuento para actualizar el total y crear la reserva.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 max-md:[&>button]:flex-1">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              !priced ||
              !availabilityReady ||
              roomTypes.isPending ||
              roomTypes.isError ||
              discountDirty
            }
          >
            {busy ? "Guardando…" : "Crear reserva"}
          </Button>
        </div>
      </div>
    </form>
  );
}
