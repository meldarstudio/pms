import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useComplaintBackup, useComplaintConfiguration } from "@/lib/queries";
import type { ComplaintBackupRequest, ComplaintSheet } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

export function ComplaintBackupForm({ onSaved }: { onSaved: (sheet: ComplaintSheet) => void }) {
  const config = useComplaintConfiguration();
  const save = useComplaintBackup();
  const command = useRef<ComplaintBackupRequest | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const fields = [
    { name: "originalReference", label: "Número original de la hoja física", max: 100 },
    { name: "fullName", label: "Nombre completo", max: 200 },
    { name: "address", label: "Domicilio", max: 500 },
    { name: "documentType", label: "Tipo de documento", max: 80 },
    { name: "documentNumber", label: "Número de documento", max: 100 },
    { name: "email", label: "Correo (opcional para carta)", optional: true, max: 200 },
    { name: "phone", label: "Teléfono (opcional)", optional: true, max: 60 },
    {
      name: "representative",
      label: "Padre o representante: nombre, documento, domicilio y contacto (si es menor)",
      optional: true,
      max: 1000,
    },
    {
      name: "reservationReference",
      label: "Referencia de reserva (opcional)",
      optional: true,
      max: 100,
    },
  ];
  async function submit(form: HTMLFormElement) {
    setError("");
    try {
      const data = new FormData(form);
      const value = (key: string) =>
        typeof data.get(key) === "string" ? (data.get(key) as string) : "";
      command.current ??= {
        requestId: crypto.randomUUID(),
        originalReference: value("originalReference"),
        filedAt: new Date(value("filedAt")).toISOString(),
        restoredAt: new Date(value("restoredAt")).toISOString(),
        input: {
          fullName: value("fullName"),
          address: value("address"),
          documentType: value("documentType"),
          documentNumber: value("documentNumber"),
          email: value("email"),
          phone: value("phone"),
          minor: data.has("minor"),
          representative: value("representative"),
          product: value("product"),
          amountCents: value("amount") ? Math.round(Number(value("amount")) * 100) : null,
          category: value("category") as "reclamo" | "queja",
          description: value("description"),
          requestedRemedy: value("requestedRemedy"),
          reservationReference: value("reservationReference"),
          responseChannel: value("responseChannel") as "email" | "letter",
          language: value("language") as "es" | "en",
          policyVersion: config.data!.policyVersion,
        },
      };
      setLocked(true);
      onSaved(await save.mutateAsync(command.current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo transcribir la hoja.");
      if (cause instanceof ApiError && cause.status === 400) {
        command.current = null;
        setLocked(false);
      }
    }
  }
  return (
    <form
      className="flex max-w-2xl flex-col gap-4 rounded border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <h2 className="text-xl font-semibold">Transcribir respaldo físico</h2>
      <p>
        Transcriba dentro de un día calendario tras la restauración. Conserve número y fecha
        originales. No se enviará otro correo automáticamente. Las fechas usan la zona horaria de
        este equipo.
      </p>
      {config.error && <p role="alert">{config.error.message}</p>}
      {config.data && (
        <p>
          Responsable: {config.data.monitoredBy}
          <br />
          Procedimiento: {config.data.backupProcedure}
          <br />
          Conservación: {config.data.retentionAndDisposal}
        </p>
      )}
      <fieldset disabled={!config.data || locked || save.isPending}>
        <FieldGroup>
          {fields.map(({ name, label, optional, max }) => (
            <Field key={name}>
              <FieldLabel htmlFor={`backup-${name}`}>{label}</FieldLabel>
              <Input
                id={`backup-${name}`}
                name={name}
                required={!optional}
                maxLength={max}
                type={name === "email" ? "email" : "text"}
              />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="backup-filedAt">
              Fecha y hora originales de presentación
            </FieldLabel>
            <Input id="backup-filedAt" name="filedAt" type="datetime-local" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="backup-restoredAt">
              Fecha y hora de restauración del libro virtual
            </FieldLabel>
            <Input id="backup-restoredAt" name="restoredAt" type="datetime-local" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="backup-minor">Consumidor menor de edad</FieldLabel>
            <input id="backup-minor" name="minor" type="checkbox" />
          </Field>
          {[
            { name: "product", label: "Producto o servicio", max: 2000 },
            { name: "description", label: "Detalle", max: 10000 },
            { name: "requestedRemedy", label: "Pedido", max: 5000 },
          ].map(({ name, label, max }) => (
            <Field key={name}>
              <FieldLabel htmlFor={`backup-${name}`}>{label}</FieldLabel>
              <Textarea id={`backup-${name}`} name={name} required maxLength={max} />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="backup-amount">
              Monto en PEN (opcional; vacío si no se conoce o no aplica)
            </FieldLabel>
            <Input
              id="backup-amount"
              name="amount"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="backup-category">Tipo</FieldLabel>
            <select id="backup-category" name="category">
              <option value="reclamo">Reclamo</option>
              <option value="queja">Queja</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="backup-language">Idioma</FieldLabel>
            <select id="backup-language" name="language">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="backup-channel">Canal de respuesta escrita</FieldLabel>
            <select id="backup-channel" name="responseChannel">
              <option value="email">Correo</option>
              <option value="letter">Carta</option>
            </select>
          </Field>
        </FieldGroup>
      </fieldset>
      {error && <p role="alert">{error} Se conserva el borrador.</p>}
      <Button className="w-fit" type="submit" disabled={!config.data || save.isPending}>
        {locked ? "Reintentar transcripción" : "Registrar transcripción"}
      </Button>
    </form>
  );
}
