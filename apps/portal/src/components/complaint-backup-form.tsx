import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { ChoiceField, TextField } from "./workflow-fields";
import { useComplaintBackup, useComplaintConfiguration, useSession } from "@/lib/queries";
import type { ComplaintBackupRequest, ComplaintSheet } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { instantOnDay } from "@/lib/property-calendar";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

function BackupField({
  name,
  label,
  optional = false,
  max,
  type = "text",
  multiline = false,
  className,
}: {
  name: string;
  label: string;
  optional?: boolean;
  max?: number;
  type?: string;
  multiline?: boolean;
  className?: string;
}) {
  const id = `backup-${name}`;
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea id={id} name={name} required={!optional} maxLength={max} />
      ) : (
        <Input id={id} name={name} type={type} required={!optional} maxLength={max} />
      )}
    </Field>
  );
}

function Section({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <FieldSet>
      <FieldLegend>{legend}</FieldLegend>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">{children}</FieldGroup>
    </FieldSet>
  );
}

export function ComplaintBackupForm({ onSaved }: { onSaved: (sheet: ComplaintSheet) => void }) {
  const config = useComplaintConfiguration();
  const timeZone = useSession().data?.propertyTimeZone;
  const save = useComplaintBackup();
  const command = useRef<ComplaintBackupRequest | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("reclamo");
  const [language, setLanguage] = useState("es");
  const [channel, setChannel] = useState("email");
  const [minor, setMinor] = useState(false);
  const [filedDay, setFiledDay] = useState("");
  const [restoredDay, setRestoredDay] = useState("");
  const [datesMissing, setDatesMissing] = useState(false);
  const minorId = useId();
  const { today } = usePropertyCalendar();
  async function submit(form: HTMLFormElement) {
    setError("");
    if (!command.current && (!filedDay || !restoredDay)) return setDatesMissing(true);
    try {
      const data = new FormData(form);
      const value = (key: string) =>
        typeof data.get(key) === "string" ? (data.get(key) as string) : "";
      const zone = timeZone!;
      const restoredAt = instantOnDay(restoredDay, zone, -Infinity, Date.now());
      command.current ??= {
        requestId: crypto.randomUUID(),
        originalReference: value("originalReference"),
        filedAt: instantOnDay(filedDay, zone, -Infinity, Date.parse(restoredAt)),
        restoredAt,
        input: {
          fullName: value("fullName"),
          address: value("address"),
          documentType: value("documentType"),
          documentNumber: value("documentNumber"),
          email: value("email"),
          phone: value("phone"),
          minor,
          representative: minor ? value("representative") : "",
          product: value("product"),
          amountCents: value("amount") ? Math.round(Number(value("amount")) * 100) : null,
          category: category as "reclamo" | "queja",
          description: value("description"),
          requestedRemedy: value("requestedRemedy"),
          reservationReference: value("reservationReference"),
          responseChannel: channel as "email" | "letter",
          language: language as "es" | "en",
          policyVersion: config.data!.policyVersion,
        },
      };
      setLocked(true);
      onSaved(await save.mutateAsync(command.current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo transcribir la hoja.");
      if (
        cause instanceof ApiError &&
        (cause.status === 400 ||
          (cause.status === 409 && cause.code === "physical complaint reference already imported"))
      ) {
        command.current = null;
        setLocked(false);
      }
    }
  }
  const disabled = !config.data || !timeZone || locked || save.isPending;
  return (
    <form
      className="flex max-w-2xl flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <h1 className="text-xl font-semibold tracking-tight">Transcribir respaldo físico</h1>
      {config.error && <p role="alert">{config.error.message}</p>}
      <fieldset disabled={disabled} className="flex flex-col gap-8">
        <Section legend="Hoja física">
          <BackupField name="originalReference" label="Número original" max={100} />
          <ChoiceField
            id="backup-category"
            name="category"
            label="Tipo"
            value={category}
            disabled={disabled}
            onChange={setCategory}
            options={[
              { value: "reclamo", label: "Reclamo" },
              { value: "queja", label: "Queja" },
            ]}
          />
          <TextField
            id="backup-filedAt"
            label="Fecha de presentación"
            type="date"
            max={restoredDay || today}
            value={filedDay}
            disabled={disabled}
            error={datesMissing && !filedDay ? "Seleccione la fecha." : undefined}
            onChange={setFiledDay}
          />
          <TextField
            id="backup-restoredAt"
            label="Fecha de restauración"
            type="date"
            min={filedDay}
            max={today}
            value={restoredDay}
            disabled={disabled}
            error={datesMissing && !restoredDay ? "Seleccione la fecha." : undefined}
            onChange={setRestoredDay}
          />
        </Section>
        <Section legend="Consumidor">
          <BackupField
            name="fullName"
            label="Nombre completo"
            max={200}
            className="sm:col-span-2"
          />
          <BackupField name="documentType" label="Tipo de documento" max={80} />
          <BackupField name="documentNumber" label="Número de documento" max={100} />
          <BackupField name="address" label="Domicilio" max={500} className="sm:col-span-2" />
          <BackupField name="email" label="Correo" type="email" optional max={200} />
          <BackupField name="phone" label="Teléfono" optional max={60} />
          <Field orientation="horizontal" className="sm:col-span-2">
            <Checkbox
              id={minorId}
              name="minor"
              checked={minor}
              onCheckedChange={(checked) => setMinor(checked)}
            />
            <FieldLabel htmlFor={minorId}>Menor de edad</FieldLabel>
          </Field>
          {minor && (
            <BackupField
              name="representative"
              label="Padre o representante"
              max={1000}
              multiline
              className="sm:col-span-2"
            />
          )}
          <ChoiceField
            id="backup-channel"
            name="responseChannel"
            label="Respuesta por"
            value={channel}
            disabled={disabled}
            onChange={setChannel}
            options={[
              { value: "email", label: "Correo" },
              { value: "letter", label: "Carta" },
            ]}
          />
          <ChoiceField
            id="backup-language"
            name="language"
            label="Idioma"
            value={language}
            disabled={disabled}
            onChange={setLanguage}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
          />
        </Section>
        <Section legend={category === "queja" ? "Queja" : "Reclamo"}>
          <BackupField
            name="product"
            label="Producto o servicio"
            max={2000}
            multiline
            className="sm:col-span-2"
          />
          <Field>
            <FieldLabel htmlFor="backup-amount">Monto en PEN (opcional)</FieldLabel>
            <Input
              id="backup-amount"
              name="amount"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
            />
          </Field>
          <BackupField
            name="reservationReference"
            label="Referencia de reserva"
            optional
            max={100}
          />
          <BackupField
            name="description"
            label="Detalle"
            max={10000}
            multiline
            className="sm:col-span-2"
          />
          <BackupField
            name="requestedRemedy"
            label="Pedido"
            max={5000}
            multiline
            className="sm:col-span-2"
          />
        </Section>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <Button
        className="w-fit"
        type="submit"
        disabled={!config.data || !timeZone || save.isPending}
      >
        {locked ? "Reintentar transcripción" : "Registrar transcripción"}
      </Button>
    </form>
  );
}
