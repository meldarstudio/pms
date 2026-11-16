import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileIcon, PaperclipIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
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
  readOnly = false,
}: {
  complaintId: string;
  responseId: string;
  attachments: ComplaintAttachment[];
  readOnly?: boolean;
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
  const uploadForm = readOnly ? null : (
    <form
      className="flex flex-col gap-3"
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
      <Field data-invalid={Boolean(validationError)} data-disabled={upload.isPending}>
        <FieldLabel htmlFor={inputId} className="sr-only">
          Archivo de evidencia
        </FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Input
            id={inputId}
            ref={input}
            type="file"
            accept={COMPLAINT_EVIDENCE_ACCEPT}
            disabled={upload.isPending}
            aria-invalid={Boolean(validationError)}
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
            className="min-w-0 flex-1"
          />
          <Button variant="outline" type="submit" disabled={!selected || upload.isPending}>
            {upload.isPending
              ? "Adjuntando…"
              : upload.error
                ? "Reintentar archivo"
                : "Adjuntar archivo"}
          </Button>
        </div>
      </Field>
      {selected && <p>Seleccionado: {selected.file.name}</p>}
      {validationError && (
        <p role="alert" className="text-destructive">
          {validationError}
        </p>
      )}
      {upload.error && (
        <p role="alert" className="text-destructive">
          No se pudo adjuntar el archivo. {translateError(upload.error.message)}
        </p>
      )}
      {upload.isSuccess && <p role="status">Archivo adjuntado</p>}
    </form>
  );
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-muted-foreground">Archivos de evidencia</h4>
      {attachments.length > 0 ? (
        <>
          <ul className="flex flex-col divide-y border">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <FileIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 break-all">
                  {attachment.name}{" "}
                  <span className="text-muted-foreground">
                    ({Math.ceil(attachment.size / 1024)} KB)
                  </span>
                </span>
                <Button
                  variant="ghost"
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
          {downloadError && (
            <p role="alert" className="text-destructive">
              {downloadError}
            </p>
          )}
          {uploadForm}
        </>
      ) : (
        <Empty className="gap-3 border p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PaperclipIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Sin archivos de evidencia</EmptyTitle>
          </EmptyHeader>
          {uploadForm && (
            <EmptyContent className="max-w-none items-stretch text-left">{uploadForm}</EmptyContent>
          )}
        </Empty>
      )}
    </div>
  );
}
