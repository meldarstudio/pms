import { ApiError } from "@/lib/api-error";
import { ComplaintBackupForm } from "./complaint-backup-form";
import { ComplaintResponseAttachments } from "./complaint-response-attachments";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useComplaint,
  useComplaints,
  useComplaintResponse,
  useComplaintEmailRetry,
  useSession,
} from "@/lib/queries";
import type { ComplaintSheet, ComplaintResponseRequest } from "@/lib/api";
import { translateError } from "@/lib/errors";

const problemText = (error: unknown) =>
  translateError(error instanceof Error ? error.message : "internal error");

export function Complaints() {
  const session = useSession();
  const list = useComplaints();
  const [id, setId] = useState<string | null>(null);
  const detail = useComplaint(id);
  const [backup, setBackup] = useState(false);
  if (session.data?.role !== "owner")
    return <main className="p-6">Se requiere una cuenta de propietario.</main>;
  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-4 lg:p-6">
      <h1 className="text-2xl font-semibold print:hidden">Libro de Reclamaciones</h1>
      <Alert className="print:hidden">
        <AlertDescription>
          Solo desarrollo. No ingrese datos reales. La activación requiere datos del operador,
          continuidad de numeración, calendario y políticas verificados.
        </AlertDescription>
      </Alert>
      {list.error && <p role="alert">{problemText(list.error)}</p>}
      {!id && (
        <Button className="w-fit print:hidden" variant="outline" onClick={() => setBackup(!backup)}>
          {backup ? "Cerrar transcripción" : "Transcribir respaldo físico"}
        </Button>
      )}
      {backup && !id && (
        <ComplaintBackupForm
          onSaved={(sheet) => {
            setBackup(false);
            setId(sheet.id);
          }}
        />
      )}
      {id ? (
        <>
          <Button className="w-fit print:hidden" variant="outline" onClick={() => setId(null)}>
            Volver al libro
          </Button>
          {detail.isPending && <p role="status">Cargando hoja…</p>}
          {detail.error && <p role="alert">{problemText(detail.error)}</p>}
          {detail.data && <ComplaintDetail key={id} sheet={detail.data} />}
        </>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hoja</TableHead>
              <TableHead>Consumidor</TableHead>
              <TableHead>Fecha límite</TableHead>
              <TableHead>Respuesta</TableHead>
              <TableHead>Correo de constancia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.map((sheet) => (
              <TableRow key={sheet.id}>
                <TableCell>
                  <Button variant="link" onClick={() => setId(sheet.id)}>
                    {sheet.reference}
                  </Button>
                </TableCell>
                <TableCell>{sheet.fullName}</TableCell>
                <TableCell>
                  {sheet.dueDate}
                  {sheet.overdue && " · Vencida"}
                </TableCell>
                <TableCell>
                  {sheet.responseStatus === "pending"
                    ? "Pendiente de respuesta"
                    : "Respuesta registrada"}
                </TableCell>
                <TableCell>{emailStatus(sheet.email.status)}</TableCell>
              </TableRow>
            ))}
            {list.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>No hay hojas registradas.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </main>
  );
}

function emailStatus(status: string) {
  return (
    (
      {
        pending: "En cola",
        sent: "Enviado al proveedor; entrega no confirmada",
        failed: "Falló el envío",
        not_requested: "Sin envío automático",
      } as Record<string, string>
    )[status] ?? status
  );
}

function ComplaintDetail({ sheet }: { sheet: ComplaintSheet }) {
  const retry = useComplaintEmailRetry(sheet.id);
  const retryId = useRef(crypto.randomUUID());
  function exportSheet() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(sheet, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sheet.reference}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat("es-PE", {
      timeZone: sheet.timeZone,
      dateStyle: "long",
      timeStyle: "long",
    }).format(new Date(value));
  const labels: Record<string, string> = {
    fullName: "Nombre completo",
    address: "Domicilio",
    documentType: "Tipo de documento",
    documentNumber: "Documento",
    email: "Correo",
    phone: "Teléfono",
    minor: "Menor de edad",
    representative: "Padre / representante",
    product: "Producto / servicio",
    amountCents: "Monto en céntimos (null: no conocido / no aplica)",
    category: "Tipo",
    description: "Detalle",
    requestedRemedy: "Pedido",
    reservationReference: "Referencia de reserva",
    responseChannel: "Canal de respuesta",
    language: "Idioma",
    policyVersion: "Versión de privacidad",
  };
  return (
    <article className="complaint-owner-sheet flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Hoja de Reclamación Nº {sheet.reference}</h2>
      <p>
        {sheet.provider.legalName} / RUC {sheet.provider.ruc}
        <br />
        {sheet.provider.address} / Código de identificación: {sheet.bookId}
        <br />
        {sheet.establishmentId}
      </p>
      <p>
        Presentado: {date(sheet.filedAt)}
        <br />
        Registrado: {date(sheet.registeredAt)}
        <br />
        Fecha límite de respuesta: {sheet.dueDate} ({sheet.timeZone})
      </p>
      <p>
        Fuente:{" "}
        {sheet.source === "physical"
          ? `Respaldo físico · ${sheet.originalReference} · Restauración: ${sheet.restoredAt ? date(sheet.restoredAt) : ""}`
          : "Virtual"}
        <br />
        Calendario: {sheet.calendarSource}
      </p>
      <p>
        {sheet.responses.length ? "Respuesta registrada" : "Pendiente de respuesta"}. Este estado no
        indica aceptación del consumidor.
      </p>
      <p>
        Constancia: {emailStatus(sheet.email.status)}{" "}
        {sheet.email.lastError && `(${sheet.email.lastError})`}
      </p>
      <dl className="grid gap-3">
        {Object.entries(sheet.input).map(([key, value]) => (
          <div key={key}>
            <dt className="font-semibold">{labels[key] ?? key}</dt>
            <dd className="whitespace-pre-wrap break-words">{String(value)}</dd>
          </div>
        ))}
      </dl>
      <p>Moneda: {sheet.currency}</p>
      <div className="flex gap-2 print:hidden">
        <Button variant="outline" onClick={() => window.print()}>
          Imprimir hoja
        </Button>
        <Button variant="outline" onClick={exportSheet}>
          Exportar hoja y respuestas
        </Button>
      </div>
      {sheet.email.status === "failed" && (
        <Button
          className="w-fit print:hidden"
          disabled={retry.isPending}
          onClick={() =>
            retry.mutate(retryId.current, {
              onSuccess: () => {
                retryId.current = crypto.randomUUID();
              },
            })
          }
        >
          Reintentar correo de constancia
        </Button>
      )}
      {retry.error && <p role="alert">{problemText(retry.error)}</p>}
      <h3 className="text-lg font-semibold">
        Observaciones y acciones adoptadas por el proveedor: respuestas enviadas
      </h3>
      {sheet.responses.map((response) => (
        <section key={response.id} className="flex flex-col gap-2 rounded border p-4">
          <p>
            {date(response.sentAt)} · {response.channel} · {response.recipient}
          </p>
          <p className="whitespace-pre-wrap">{response.text}</p>
          <p>Evidencia: {response.evidence}</p>
          <p>
            Registro: {date(response.recordedAt)} · {response.recordedBy}
          </p>
          {response.correctsId && <p>Corrige el registro {response.correctsId}</p>}
          <ComplaintResponseAttachments
            complaintId={sheet.id}
            responseId={response.id}
            attachments={response.attachments}
          />
        </section>
      ))}
      <ResponseForm sheet={sheet} />
    </article>
  );
}

function ResponseForm({ sheet }: { sheet: ComplaintSheet }) {
  const save = useComplaintResponse(sheet.id);
  const [draft, setDraft] = useState({
    text: "",
    channel: sheet.input.responseChannel,
    recipient: sheet.input.responseChannel === "email" ? sheet.input.email : sheet.input.address,
    sentAt: "",
    evidence: "",
    correctsId: "",
  });
  const command = useRef<ComplaintResponseRequest | null>(null);
  const [locked, setLocked] = useState(false);
  function update(key: keyof typeof draft, value: string) {
    if (!command.current) setDraft({ ...draft, [key]: value });
  }
  async function submit() {
    command.current ??= {
      requestId: crypto.randomUUID(),
      text: draft.text,
      channel: draft.channel,
      recipient: draft.recipient,
      sentAt: new Date(draft.sentAt).toISOString(),
      evidence: draft.evidence,
      correctsId: draft.correctsId || null,
    };
    setLocked(true);
    try {
      await save.mutateAsync(command.current);
      command.current = null;
      setLocked(false);
      setDraft({ ...draft, text: "", evidence: "", sentAt: "", correctsId: "" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        command.current = null;
        setLocked(false);
      }
    }
  }
  return (
    <form
      className="flex flex-col gap-4 print:hidden"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 className="text-lg font-semibold">Registrar respuesta ya enviada</h3>
      <p>
        Revise el detalle y el pedido con recepción y los registros disponibles. Responda por el
        canal escrito elegido antes de la fecha límite y registre aquí la respuesta ya enviada. La
        fecha de envío usa la zona horaria de este equipo.
      </p>
      <fieldset disabled={save.isPending || locked}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="complaint-response">Respuesta enviada</FieldLabel>
            <Textarea
              id="complaint-response"
              value={draft.text}
              onChange={(event) => update("text", event.target.value)}
              required
              maxLength={10000}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="complaint-response-channel">Canal</FieldLabel>
            <select
              id="complaint-response-channel"
              className="h-10 rounded border px-3"
              value={draft.channel}
              onChange={(event) => update("channel", event.target.value)}
            >
              <option value="email">Correo</option>
              <option value="letter">Carta</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="complaint-recipient">Destinatario</FieldLabel>
            <Input
              id="complaint-recipient"
              value={draft.recipient}
              onChange={(event) => update("recipient", event.target.value)}
              required
              maxLength={500}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="complaint-sent">Fecha y hora real de envío</FieldLabel>
            <Input
              id="complaint-sent"
              name="sentAt"
              type="datetime-local"
              required
              value={draft.sentAt}
              onChange={(event) => update("sentAt", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="complaint-evidence">Referencia de evidencia</FieldLabel>
            <Input
              id="complaint-evidence"
              name="evidence"
              required
              maxLength={2000}
              aria-describedby="complaint-evidence-help"
              value={draft.evidence}
              onChange={(event) => update("evidence", event.target.value)}
            />
            <FieldDescription id="complaint-evidence-help">
              {draft.channel === "email"
                ? "Envíe desde hotelmanantialchurinperu@gmail.com. Identifique el mensaje enviado y guarde un PDF que incluya destinatario, fecha, hora y respuesta completa."
                : "Identifique la constancia de despacho postal y conserve una copia de la carta enviada junto con esa constancia."}{" "}
              Después de registrar la respuesta, adjunte la evidencia a ese registro. Si el envío
              falla, resuélvalo antes de registrar una respuesta enviada.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="complaint-correction">Registro que corrige (opcional)</FieldLabel>
            <select
              id="complaint-correction"
              className="h-10 rounded border px-3"
              value={draft.correctsId}
              onChange={(event) => update("correctsId", event.target.value)}
            >
              <option value="">Nueva respuesta</option>
              {sheet.responses.map((response) => (
                <option key={response.id} value={response.id}>
                  {response.sentAt} · {response.id}
                </option>
              ))}
            </select>
          </Field>
        </FieldGroup>
      </fieldset>
      {save.error && (
        <p role="alert">
          No se pudo registrar la respuesta. {problemText(save.error)} Se conserva el borrador.
        </p>
      )}
      {save.isSuccess && <p role="status">Respuesta registrada</p>}
      <Button className="w-fit" disabled={save.isPending} type="submit">
        {save.error ? "Reintentar registro" : "Registrar respuesta enviada"}
      </Button>
    </form>
  );
}
