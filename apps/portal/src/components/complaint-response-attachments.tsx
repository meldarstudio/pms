import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  downloadComplaintAttachment,
  type ComplaintAttachment,
  type ComplaintAttachmentUpload,
} from "@/lib/api";
import { useComplaintAttachment } from "@/lib/queries";
import { translateError } from "@/lib/errors";
import { COMPLAINT_EVIDENCE_ACCEPT, complaintEvidenceProblem } from "@/lib/complaint-evidence";

export function ComplaintResponseAttachments({
  complaintId,
  responseId,
  attachments,
}: {
  complaintId: string;
  responseId: string;
  attachments: ComplaintAttachment[];
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const upload = useComplaintAttachment(complaintId);
  const [selected, setSelected] = useState<ComplaintAttachmentUpload | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  async function download(attachment: ComplaintAttachment) {
    setDownloadError(null);
    setDownloading(attachment.id);
    try {
      const blob = await downloadComplaintAttachment(complaintId, responseId, attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(translateError(error instanceof Error ? error.message : "internal error"));
    } finally {
      setDownloading(null);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-semibold">Archivos de evidencia</h4>
      {attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center gap-2">
              <span className="break-all">{attachment.name}</span>
              <span className="text-muted-foreground">
                ({Math.ceil(attachment.size / 1024)} KB)
              </span>
              <Button
                className="print:hidden"
                variant="outline"
                size="sm"
                type="button"
                aria-label={`Descargar ${attachment.name}`}
                disabled={downloading !== null}
                onClick={() => void download(attachment)}
              >
                {downloading === attachment.id ? "Descargando…" : "Descargar"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {downloadError && <p role="alert">{downloadError}</p>}
      <form
        className="flex flex-col gap-3 print:hidden"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected) return;
          upload.mutate(selected, {
            onSuccess: () => {
              setSelected(null);
              if (input.current) input.current.value = "";
            },
          });
        }}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(validationError)} data-disabled={upload.isPending}>
            <FieldLabel htmlFor={inputId}>Adjuntar evidencia a esta respuesta</FieldLabel>
            <Input
              id={inputId}
              ref={input}
              type="file"
              accept={COMPLAINT_EVIDENCE_ACCEPT}
              disabled={upload.isPending}
              aria-invalid={Boolean(validationError)}
              aria-describedby={`${inputId}-help`}
              onChange={(event) => {
                upload.reset();
                setValidationError(null);
                const file = event.target.files?.[0];
                if (!file) {
                  setSelected(null);
                  return;
                }
                const error = complaintEvidenceProblem(file);
                if (error) {
                  setSelected(null);
                  setValidationError(translateError(error));
                  return;
                }
                setSelected({ responseId, attachmentId: crypto.randomUUID(), file });
              }}
            />
            <FieldDescription id={`${inputId}-help`}>
              PDF, JPG o PNG · máximo 5 MB por archivo. Archivos privados para el propietario. Los
              archivos guardados se conservan como parte del historial de esta respuesta.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {selected && <p>Seleccionado: {selected.file.name}</p>}
        {validationError && <p role="alert">{validationError}</p>}
        {upload.error && (
          <p role="alert">
            No se pudo adjuntar el archivo. {translateError(upload.error.message)} Se conserva el
            archivo seleccionado para reintentar.
          </p>
        )}
        {upload.isSuccess && <p role="status">Archivo adjuntado</p>}
        <Button
          className="w-fit"
          variant="outline"
          type="submit"
          disabled={!selected || upload.isPending}
        >
          {upload.isPending
            ? "Adjuntando…"
            : upload.error
              ? "Reintentar archivo"
              : "Adjuntar archivo"}
        </Button>
      </form>
    </div>
  );
}
