import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { BedDoubleIcon, PlusIcon } from "lucide-react";
import { CreationSummary, type CreationSummaryError } from "@/components/creation-summary";
import { DiscountPopover } from "@/components/discount-popover";
import { ReservationRoomRow } from "@/components/reservation-room-rows";
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
import {
  createWorkflowBooking,
  type CreationPreviewInput,
  type ReservationDetail,
} from "@/lib/api";
import { serverFieldErrors } from "@/lib/api-error";
import { format, nightsBetween } from "@/lib/dates";
import { parseISO } from "date-fns";
import { setServerErrors } from "@/lib/form-errors";
import { CURRENCY, formatMajor, parseMajorToCents } from "@/lib/money";
import { ChoiceCardsSkeleton } from "@/components/workflow-fields";
import { newBookingAvailability } from "@/lib/new-booking-availability";
import {
  useAvailability,
  refreshAfterCreation,
  useCreationPreview,
  useRatePlans,
  useRooms,
  useRoomTypes,
} from "@/lib/queries";
import { ratePlanLabels, ratePlanSummary } from "@/lib/rate-plans";
import { changeCheckIn, minimumCheckOut } from "@/lib/reservation-editor";
import { blurThenChange, submitForm, useReservationForm } from "@/lib/reservation-form";
import {
  newBookingSchema,
  schemaErrors,
  workflowDrafts,
  type NewBookingValues,
} from "@/lib/reservation-form-schemas";
import { propertyToday } from "@/lib/property-calendar";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { phoneDraft, phonePayload } from "@/lib/phone";

export function NewBooking({
  target,
  onCreated,
  onCancel,
  onDirtyChange,
  onSavingChange,
}: {
  target: Exclude<BookingTarget, { mode: "edit" }>;
  onCreated: (reservation: ReservationDetail) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const client = useQueryClient();
  const roomTypes = useRoomTypes();
  const rooms = useRooms();
  const ratePlans = useRatePlans();
  const { today } = usePropertyCalendar();
  const schema = useMemo(() => newBookingSchema(roomTypes.data ?? []), [roomTypes.data]);
  const [defaults] = useState<NewBookingValues>(() => {
    const checkIn = target.mode === "create" ? target.checkIn : propertyToday();
    return {
      checkIn,
      checkOut: minimumCheckOut(checkIn),
      ratePlan: "flexible",
      fullName: "",
      email: "",
      phone: phoneDraft(null),
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
  const [revealingRoomId, setRevealingRoomId] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{
    rooms: NewBookingValues["rooms"];
    fields: Record<string, string>;
  } | null>(null);
  const [discountBlocking, setDiscountBlocking] = useState(false);
  const retry = useRef<{ payload: string; requestId: string } | null>(null);
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      if (!ready) return;
      setError("");
      setRejected(null);
      const parsed = schema.parse(value);
      const phone = phonePayload(parsed.phone);
      const data = {
        guest: {
          fullName: parsed.fullName,
          ...(phone ? { phone } : {}),
          ...(parsed.email ? { email: parsed.email } : {}),
        },
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        rooms: workflowDrafts(parsed).map((draft) => draft.room),
        notes: parsed.notes,
        discountCents: parseMajorToCents(parsed.discount.trim() || "0")!,
        ratePlan: parsed.ratePlan,
      };
      const payload = JSON.stringify(data);
      if (retry.current?.payload !== payload)
        retry.current = { payload, requestId: crypto.randomUUID() };
      try {
        const result = await createWorkflowBooking({
          ...data,
          requestId: retry.current!.requestId,
        });
        await refreshAfterCreation(client);
        onDirtyChange(false);
        onCreated(result);
      } catch (cause) {
        const fields =
          serverFieldErrors(cause, "details", "rooms") ?? serverFieldErrors(cause, "guest");
        if (fields) {
          setServerErrors(form, fields);
          setRejected({ rooms: form.state.values.rooms, fields });
        } else setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const busy = useSelector(form.store, (state) => state.isSubmitting);
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);
  useEffect(
    () => onDirtyChange(!unchanged || discountBlocking),
    [unchanged, discountBlocking, onDirtyChange],
  );
  useEffect(() => {
    onSavingChange(busy);
    return () => onSavingChange(false);
  }, [busy, onSavingChange]);

  const nights = nightsBetween(values.checkIn, values.checkOut);
  const validStay = nights >= 1 && nights <= 60;
  const availability = useAvailability(values.checkIn, values.checkOut, validStay);
  const availabilityReady =
    validStay && roomTypes.isSuccess && rooms.isSuccess && availability.isSuccess;
  const availabilityFresh = availabilityReady && !availability.isFetching;
  const selection = newBookingAvailability(
    values.rooms,
    availability.data?.roomTypes ?? [],
    rooms.data ?? [],
  );
  useEffect(() => {
    if (availabilityFresh && !busy && selection.rooms !== values.rooms)
      form.setFieldValue("rooms", selection.rooms);
  }, [availabilityFresh, busy, selection.rooms, values.rooms, form]);
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
  const discountCents = parseMajorToCents(values.discount.trim() || "0") ?? 0;
  const validPrices = !Object.keys(errors).some((name) => name.endsWith(".nightlyRate"));
  const previewInput: CreationPreviewInput | null =
    validStay && validPrices && values.rooms.every((draft) => draft.room.roomTypeId)
      ? {
          checkIn: values.checkIn,
          checkOut: values.checkOut,
          ratePlan: values.ratePlan,
          discountCents,
          rooms: workflowDrafts(values).map(({ room }) => ({
            roomTypeId: room.roomTypeId,
            ...(room.nightlyRateCents !== undefined
              ? { nightlyRateCents: room.nightlyRateCents }
              : {}),
          })),
        }
      : null;
  const preview = useCreationPreview(previewInput);
  const billing =
    previewInput && preview.current && preview.isSuccess && !preview.isFetching
      ? preview.data.billing
      : null;
  const ready =
    availabilityFresh &&
    selection.rooms === values.rooms &&
    billing !== null &&
    !preview.isFetching &&
    !discountBlocking;
  const summaryRooms = values.rooms.map((draft) => ({
    key: draft.id,
    typeName:
      roomTypes.data?.find((type) => type.id === draft.room.roomTypeId)?.name ??
      "Selecciona un tipo",
    roomNumber: rooms.data?.find((room) => room.id === draft.room.roomId)?.number ?? null,
    adults: /^\d+$/.test(draft.room.adults) ? Number(draft.room.adults) : null,
    children: /^\d+$/.test(draft.room.children) ? Number(draft.room.children) : null,
  }));
  const failedLoads = [roomTypes, rooms, ratePlans, availability].filter((query) => query.error);
  const summaryError: CreationSummaryError | null = failedLoads[0]?.error
    ? {
        title: "No se pudieron cargar los datos",
        error: failedLoads[0].error,
        onRetry: () => failedLoads.forEach((query) => void query.refetch()),
      }
    : previewInput && preview.current && preview.error
      ? {
          title: "No se pudo calcular el total",
          error: preview.error,
          onRetry: () => void preview.refetch(),
        }
      : null;
  const planOptions = (ratePlans.data ?? [{ plan: "flexible" as const }]).map((terms) => ({
    value: terms.plan,
    label: ratePlanLabels[terms.plan] ?? terms.plan,
    description: "cancellationPolicy" in terms ? ratePlanSummary(terms) : undefined,
  }));

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
                {ratePlans.isPending ? (
                  <ChoiceCardsSkeleton
                    label="Tarifa"
                    loadingLabel="Cargando tarifas…"
                    className="md:col-span-2"
                    optionsClassName="md:grid-cols-2"
                    cards={[
                      { title: "w-12", lines: ["block w-full", "block w-3/4"] },
                      { title: "w-24", lines: ["block w-full", "block w-1/2 max-md:hidden"] },
                    ]}
                  />
                ) : (
                  <form.AppField name="ratePlan">
                    {(field) => (
                      <field.ChoiceCards
                        label="Tarifa"
                        options={planOptions}
                        className="md:col-span-2"
                        optionsClassName="md:grid-cols-2"
                      />
                    )}
                  </form.AppField>
                )}
              </FieldGroup>
            </FieldSet>
            <section className="flex flex-col gap-3" aria-label="Habitaciones">
              <h3 className="text-sm font-medium">Habitaciones</h3>
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
                        const capacity =
                          errors[`rooms[${index}].room`] ??
                          (rejected?.rooms === values.rooms
                            ? rejected.fields[`rooms[${index}].room`]
                            : undefined);
                        return (
                          <ReservationRoomRow
                            key={draft.id}
                            reveal={draft.id === revealingRoomId}
                            index={index}
                            count={values.rooms.length}
                            onRemove={() => form.removeFieldValue("rooms", index)}
                            price={{
                              open: draft.room.nightlyRate !== undefined,
                              onOpen: () =>
                                form.setFieldValue(`rooms[${index}].room.nightlyRate`, ""),
                              field: (onUndo) => (
                                <form.AppField name={`rooms[${index}].room.nightlyRate`}>
                                  {(field) => <field.NightlyPrice onUndo={onUndo} />}
                                </form.AppField>
                              ),
                            }}
                            typeField={
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
                            }
                            roomField={
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
                            }
                            adultsField={
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
                            }
                            childrenField={
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
                            }
                            feedback={
                              capacity && (
                                <FieldError id={`${draft.id}-capacity`}>{capacity}</FieldError>
                              )
                            }
                          />
                        );
                      })
                    }
                  </form.Field>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    disabled={!availabilityReady || !selection.canAdd}
                    onClick={(event) => {
                      const lastRoom = values.rooms[values.rooms.length - 1].room;
                      const type = availability.data?.roomTypes.find(
                        (type) => type.id === lastRoom.roomTypeId,
                      );
                      const used = values.rooms.filter(
                        (draft) => draft.room.roomTypeId === lastRoom.roomTypeId,
                      ).length;
                      const id = crypto.randomUUID();
                      setRevealingRoomId(event.detail > 0 ? id : null);
                      form.pushFieldValue("rooms", {
                        id,
                        removed: false,
                        room: {
                          ...lastRoom,
                          roomTypeId: type && type.free > used ? lastRoom.roomTypeId : "",
                          roomId: null,
                          nightlyRate: undefined,
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
                  <form.AppField name="phone">{(field) => <field.Phone />}</form.AppField>
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
            <CreationSummary
              stayLabel={
                validStay
                  ? `${format(parseISO(values.checkIn), "d MMM")} – ${format(parseISO(values.checkOut), "d MMM yyyy")} · ${nights} ${nights === 1 ? "noche" : "noches"}`
                  : null
              }
              rooms={summaryRooms}
              billing={billing}
              checkIn={values.checkIn}
              today={today}
              message={
                !validStay
                  ? "Indica una estancia de 1 a 60 noches."
                  : !validPrices
                    ? "Revisa el precio por noche para ver el total."
                    : !previewInput
                      ? "Selecciona los tipos de habitación para ver el total."
                      : null
              }
              error={summaryError}
              discount={
                <DiscountPopover
                  appliedCents={discountCents}
                  shownCents={billing?.discountCents ?? discountCents}
                  currency={billing?.currency ?? availability.data?.currency ?? CURRENCY}
                  disabled={busy}
                  onApply={(cents) => form.setFieldValue("discount", formatMajor(cents))}
                  onBlockingChange={setDiscountBlocking}
                />
              }
            />
          </aside>
        </fieldset>
      </div>
      <Separator className="shrink-0" />
      <div className="flex shrink-0 flex-col gap-3 max-md:py-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:safe-area-padding-x md:flex-row md:items-center md:gap-6">
        <div className="flex min-w-0 flex-col gap-1 empty:hidden">
          <FieldError>{error}</FieldError>
          {discountBlocking && (
            <p role="status" className="text-muted-foreground">
              Aplica o cierra el descuento para crear la reserva.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 max-md:[&>button]:flex-1 md:ml-auto md:shrink-0">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={busy || !ready || roomTypes.isPending || roomTypes.isError}
          >
            {busy ? "Guardando…" : "Crear reserva"}
          </Button>
        </div>
      </div>
    </form>
  );
}
