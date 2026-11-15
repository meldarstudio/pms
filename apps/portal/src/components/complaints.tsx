import { useBlocker } from "@tanstack/react-router";
import { ApiError } from "@/lib/api-error";
import { ComplaintBackupForm } from "./complaint-backup-form";
import { ComplaintResponseAttachments } from "./complaint-response-attachments";
import { useEffect, useRef, useState } from "react";
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
import {
  useComplaint,
  useComplaints,
  useComplaintAttachment,
  useComplaintNote,
  useComplaintReceiptCopy,
  useComplaintResponse,
  useSession,
} from "@/lib/queries";
import type {
  ComplaintAttachmentUpload,
  ComplaintEmail,
  ComplaintNoteRequest,
  ComplaintResponseRequest,
  ComplaintSheet,
} from "@/lib/api";
import { translateError } from "@/lib/errors";
import { COMPLAINT_EVIDENCE_ACCEPT, complaintEvidenceProblem } from "@/lib/complaint-evidence";

const problemText = (error: unknown) =>
  translateError(error instanceof Error ? error.message : "internal error");

export function Complaints() {
  const session = useSession();
  const list = useComplaints();
  const [id, setId] = useState<string | null>(null);
  const detail = useComplaint(id);
  const [backup, setBackup] = useState(false);
  const [unattachedEvidence, setUnattachedEvidence] = useState(false);
  if (session.data?.role !== "owner")
    return <main className="p-6">Se requiere una cuenta de propietario.</main>;
  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-4 lg:p-6">
      <h1 className="text-2xl font-semibold print:hidden">Libro de Reclamaciones</h1>
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
          <Button
            className="w-fit print:hidden"
            variant="outline"
            onClick={() => {
              if (unattachedEvidence && !window.confirm(LEAVE_WITHOUT_EVIDENCE)) return;
              setId(null);
            }}
          >
            Volver al libro
          </Button>
          {detail.isPending && <p role="status">Cargando hoja…</p>}
          {detail.error && <p role="alert">{problemText(detail.error)}</p>}
          {detail.data && (
            <ComplaintDetail
              key={id}
              sheet={detail.data}
              onUnattachedEvidence={setUnattachedEvidence}
            />
          )}
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
                <TableCell>{emailStatus(sheet.email)}</TableCell>
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

function emailStatus(email: Pick<ComplaintEmail, "status">) {
  return {
    not_requested: "No solicitado",
    pending: "En cola",
    sent: "Aceptado por el proveedor de correo",
    failed: "Requiere atención",
  }[email.status];
}

function sheetDateFormatter(sheet: ComplaintSheet) {
  return (value: string) =>
    new Intl.DateTimeFormat("es-PE", {
      timeZone: sheet.timeZone,
      dateStyle: "long",
      timeStyle: "long",
    }).format(new Date(value));
}

function ComplaintDetail({
  sheet,
  onUnattachedEvidence,
}: {
  sheet: ComplaintSheet;
  onUnattachedEvidence: (unattached: boolean) => void;
}) {
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
  const date = sheetDateFormatter(sheet);
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
          Exportar hoja, respuestas y notas
        </Button>
      </div>
      <ReceiptEmails sheet={sheet} />
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
      <ResponseForm sheet={sheet} onUnattachedEvidence={onUnattachedEvidence} />
      <Notes sheet={sheet} />
    </article>
  );
}

function ReceiptEmails({ sheet }: { sheet: ComplaintSheet }) {
  const copy = useComplaintReceiptCopy(sheet.id);
  const requestId = useRef(crypto.randomUUID());
  const date = sheetDateFormatter(sheet);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">Constancia por correo: {emailStatus(sheet.email)}</h3>
      {sheet.email.status === "sent" && (
        <p>Aceptado por el proveedor de correo no confirma la entrega ni la lectura.</p>
      )}
      {sheet.emails.length > 0 && sheet.email.status !== "not_requested" && (
        <ol className="flex flex-col gap-1">
          {sheet.emails.map((email) => (
            <li key={email.id}>
              {email.kind === "copy" ? "Copia adicional" : "Envío automático"} ·{" "}
              {date(email.createdAt)} · {emailStatus(email)}
              {email.sentAt && ` · ${date(email.sentAt)}`}
            </li>
          ))}
        </ol>
      )}
      {sheet.email.status === "failed" && (
        <div className="flex flex-col gap-2 print:hidden">
          <p>
            El envío automático se detuvo sin confirmar que el proveedor aceptara el correo. El
            intento anterior pudo haber enviado una copia, así que el consumidor podría recibir dos
            correos de esta misma hoja. La copia envía la hoja guardada sin cambiar su número, fecha
            de presentación, fecha límite ni estado de respuesta.
          </p>
          <Button
            className="w-fit"
            disabled={copy.isPending}
            onClick={() =>
              copy.mutate(requestId.current, {
                onSuccess: () => {
                  requestId.current = crypto.randomUUID();
                },
              })
            }
          >
            Enviar otra copia
          </Button>
        </div>
      )}
      {copy.error && <p role="alert">{problemText(copy.error)}</p>}
    </section>
  );
}

function Notes({ sheet }: { sheet: ComplaintSheet }) {
  const save = useComplaintNote(sheet.id);
  const date = sheetDateFormatter(sheet);
  const [text, setText] = useState("");
  const command = useRef<ComplaintNoteRequest | null>(null);
  const [locked, setLocked] = useState(false);
  async function submit() {
    command.current ??= { requestId: crypto.randomUUID(), text };
    setLocked(true);
    try {
      await save.mutateAsync(command.current);
      command.current = null;
      setLocked(false);
      setText("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        command.current = null;
        setLocked(false);
      }
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Notas</h3>
      {sheet.notes.length ? (
        <ol className="flex flex-col gap-2">
          {sheet.notes.map((note) => (
            <li key={note.id} className="rounded border p-4">
              <p>
                {date(note.recordedAt)} · {note.recordedBy}
              </p>
              <p className="whitespace-pre-wrap">{note.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>Sin notas.</p>
      )}
      <form
        className="flex flex-col gap-3 print:hidden"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field>
          <FieldLabel htmlFor="complaint-note">Agregar nota</FieldLabel>
          <Textarea
            id="complaint-note"
            name="note"
            value={text}
            disabled={locked || save.isPending}
            onChange={(event) => setText(event.target.value)}
            required
            maxLength={5000}
            aria-describedby="complaint-note-help"
          />
          <FieldDescription id="complaint-note-help">
            La nota queda fechada con su autor y no modifica la hoja, las respuestas ni otras notas.
            No registra una respuesta ni cambia la fecha límite. Para una nueva respuesta enviada,
            use el formulario de respuesta.
          </FieldDescription>
        </Field>
        {save.error && (
          <p role="alert">
            No se pudo guardar la nota. {problemText(save.error)} Se conserva el texto.
          </p>
        )}
        <Button className="w-fit" variant="outline" type="submit" disabled={save.isPending}>
          {save.error ? "Reintentar nota" : "Guardar nota"}
        </Button>
      </form>
    </section>
  );
}

const LEAVE_WITHOUT_EVIDENCE =
  "La respuesta se guardó, pero la evidencia seleccionada no se adjuntó. Si sale, tendrá que seleccionarla de nuevo. ¿Salir?";

function sameFile(a: File, b: File) {
  return (
    a.name === b.name && a.size === b.size && a.type === b.type && a.lastModified === b.lastModified
  );
}

function ResponseForm({
  sheet,
  onUnattachedEvidence,
}: {
  sheet: ComplaintSheet;
  onUnattachedEvidence: (unattached: boolean) => void;
}) {
  const save = useComplaintResponse(sheet.id);
  const attach = useComplaintAttachment(sheet.id);
  const blank = {
    text: "",
    channel: sheet.input.responseChannel,
    recipient: sheet.input.responseChannel === "email" ? sheet.input.email : sheet.input.address,
    sentAt: "",
    evidence: "",
  };
  const [draft, setDraft] = useState(blank);
  const command = useRef<ComplaintResponseRequest | null>(null);
  const [locked, setLocked] = useState(false);
  const [evidence, setEvidence] = useState<Omit<ComplaintAttachmentUpload, "responseId"> | null>(
    null,
  );
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [savedResponseId, setSavedResponseId] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "saving" | "attaching">("idle");
  const [recorded, setRecorded] = useState<string | null>(null);
  const running = useRef(false);
  const awaitingEvidence = savedResponseId !== null;
  useBlocker({
    shouldBlockFn: () => awaitingEvidence && !window.confirm(LEAVE_WITHOUT_EVIDENCE),
    enableBeforeUnload: () => awaitingEvidence,
  });
  useEffect(() => {
    onUnattachedEvidence(awaitingEvidence);
    if (awaitingEvidence) return () => onUnattachedEvidence(false);
  }, [awaitingEvidence, onUnattachedEvidence]);
  function update(key: keyof typeof draft, value: string) {
    if (!command.current) setDraft({ ...draft, [key]: value });
  }
  function clearFile() {
    setEvidence(null);
    setFileProblem(null);
    if (fileInput.current) fileInput.current.value = "";
  }
  function selectFile(file: File | undefined) {
    attach.reset();
    setFileProblem(null);
    if (!file) {
      if (!awaitingEvidence) setEvidence(null);
      return;
    }
    const problem = complaintEvidenceProblem(file);
    if (problem) {
      if (fileInput.current) fileInput.current.value = "";
      setFileProblem(`${translateError(problem)} No se usará ${file.name}.`);
      return;
    }
    setEvidence((current) =>
      current && sameFile(current.file, file)
        ? current
        : { attachmentId: crypto.randomUUID(), file },
    );
  }
  function finish(message: string) {
    command.current = null;
    setLocked(false);
    setSavedResponseId(null);
    clearFile();
    setDraft(blank);
    save.reset();
    attach.reset();
    setRecorded(message);
  }
  async function submit() {
    if (running.current) return;
    running.current = true;
    setRecorded(null);
    try {
      let responseId = savedResponseId;
      if (!responseId) {
        command.current ??= {
          requestId: crypto.randomUUID(),
          text: draft.text,
          channel: draft.channel,
          recipient: draft.recipient,
          sentAt: new Date(draft.sentAt).toISOString(),
          evidence: draft.evidence,
        };
        setLocked(true);
        setStep("saving");
        try {
          await save.mutateAsync(command.current);
        } catch (error) {
          if (error instanceof ApiError && error.status === 400) {
            command.current = null;
            setLocked(false);
          }
          return;
        }
        responseId = command.current.requestId;
        setSavedResponseId(responseId);
      }
      if (!evidence) return finish("Respuesta registrada sin archivo de evidencia");
      setStep("attaching");
      try {
        await attach.mutateAsync({ responseId, ...evidence });
      } catch {
        return;
      }
      finish("Respuesta registrada con evidencia");
    } finally {
      running.current = false;
      setStep("idle");
    }
  }
  const busy = step !== "idle";
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
        canal escrito elegido antes de la fecha límite y registre aquí la respuesta ya enviada. El
        portal no envía la respuesta. La fecha de envío usa la zona horaria de este equipo.
      </p>
      <fieldset disabled={busy || locked}>
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
              Si el envío falla, resuélvalo antes de registrar una respuesta enviada.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </fieldset>
      <Field data-invalid={Boolean(fileProblem)} data-disabled={busy}>
        <FieldLabel htmlFor="complaint-evidence-file">Archivo de evidencia (opcional)</FieldLabel>
        <Input
          id="complaint-evidence-file"
          ref={fileInput}
          name="evidenceFile"
          type="file"
          accept={COMPLAINT_EVIDENCE_ACCEPT}
          disabled={busy}
          aria-invalid={Boolean(fileProblem)}
          aria-describedby="complaint-evidence-file-help"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        <FieldDescription id="complaint-evidence-file-help">
          Un archivo PDF, JPG o PNG de hasta 5 MB, privado para el propietario. Puede adjuntar más
          archivos a la respuesta después de guardarla.
        </FieldDescription>
      </Field>
      {evidence && (
        <p className="flex flex-wrap items-center gap-2">
          <span className="break-all">Seleccionado: {evidence.file.name}</span>
          {!awaitingEvidence && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={clearFile}>
              Quitar archivo
            </Button>
          )}
        </p>
      )}
      {fileProblem && <p role="alert">{fileProblem}</p>}
      {busy && (
        <p role="status">{step === "saving" ? "Guardando respuesta…" : "Adjuntando evidencia…"}</p>
      )}
      {save.error && !awaitingEvidence && !busy && (
        <p role="alert">
          No se pudo guardar la respuesta. {problemText(save.error)} Se conservan los datos y el
          archivo seleccionado.
        </p>
      )}
      {awaitingEvidence && !busy && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="font-semibold">
            La respuesta se guardó, pero no se pudo adjuntar la evidencia. Puedes reintentar sin
            registrar otra respuesta.
          </p>
          {attach.error && <p>{problemText(attach.error)}</p>}
          <p>
            Si eliges adjuntar después, la respuesta queda guardada, pero tendrás que seleccionar el
            archivo de nuevo en esa respuesta.
          </p>
        </div>
      )}
      {recorded && <p role="status">{recorded}</p>}
      <div className="flex flex-wrap gap-2">
        {awaitingEvidence ? (
          <>
            <Button className="w-fit" type="submit" disabled={busy || !evidence}>
              {busy ? "Adjuntando evidencia…" : "Reintentar evidencia"}
            </Button>
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => finish("Respuesta registrada sin evidencia adjunta")}
            >
              Adjuntar después
            </Button>
          </>
        ) : (
          <Button className="w-fit" type="submit" disabled={busy}>
            {step === "saving"
              ? "Guardando respuesta…"
              : step === "attaching"
                ? "Adjuntando evidencia…"
                : save.error
                  ? "Reintentar guardado"
                  : "Guardar respuesta"}
          </Button>
        )}
      </div>
    </form>
  );
}
