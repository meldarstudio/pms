import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  FileInputIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { useIsMobile } from "@/hooks/use-mobile";
import { ApiError } from "@/lib/api-error";
import { ComplaintBackupForm } from "./complaint-backup-form";
import { ComplaintResponseAttachments } from "./complaint-response-attachments";
import { PageError } from "./page-error";
import { PageTitle } from "./page-title";
import { ChoiceField, TextField } from "./workflow-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAccounts,
  useComplaint,
  useComplaints,
  useComplaintAttachment,
  useComplaintReceiptCopy,
  useComplaintResponse,
  useSession,
  useVoidComplaintResponse,
} from "@/lib/queries";
import type {
  ComplaintAttachmentUpload,
  ComplaintEmail,
  ComplaintResponseRequest,
  ComplaintSheet,
  ComplaintSummary,
} from "@/lib/api";
import { longDate } from "@/lib/dates";
import { dayInZone } from "@/lib/property-calendar";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { formatMoney } from "@/lib/money";
import { translateError } from "@/lib/errors";
import { COMPLAINT_EVIDENCE_ACCEPT, complaintEvidenceProblem } from "@/lib/complaint-evidence";

const problemText = (error: unknown) =>
  translateError(error instanceof Error ? error.message : "internal error");

const categoryLabel = (category: string) => (category === "queja" ? "Queja" : "Reclamo");
const channelLabel = (channel: string) => (channel === "letter" ? "Carta" : "Correo");
const languageLabel = (language: string) => (language === "en" ? "English" : "Español");

type AuthorName = (accountId: string) => string;

const OWNER_REQUIRED = <main className="p-6">Se requiere una cuenta de propietario.</main>;

function BookCrumb({ page }: { page: string }) {
  return (
    <PageTitle>
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink render={<Link to="/complaints" />}>
              Libro de Reclamaciones
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:inline-flex" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate font-medium">{page}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </PageTitle>
  );
}

export function ComplaintList() {
  const session = useSession();
  const owner = session.data?.role === "owner";
  const list = useComplaints();
  const navigate = useNavigate();
  if (!owner) return OWNER_REQUIRED;
  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-4 text-xs/relaxed lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Libro de Reclamaciones</h1>
        <Button variant="outline" nativeButton={false} render={<Link to="/complaints/backup" />}>
          <FileInputIcon data-icon="inline-start" />
          Transcribir respaldo físico
        </Button>
      </div>
      {list.error && <p role="alert">{problemText(list.error)}</p>}
      {list.isPending && <ListSkeleton />}
      {list.data?.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No hay hojas registradas</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {list.data && list.data.length > 0 && (
        <ComplaintTable
          sheets={list.data}
          timeZone={session.data?.propertyTimeZone}
          onOpen={(complaintId) =>
            void navigate({ to: "/complaints/$complaintId", params: { complaintId } })
          }
        />
      )}
    </main>
  );
}

function ComplaintTable({
  sheets,
  timeZone,
  onOpen,
}: {
  sheets: ComplaintSummary[];
  timeZone: string | undefined;
  onOpen: (id: string) => void;
}) {
  const filed = new Intl.DateTimeFormat("es-PE", { timeZone, dateStyle: "medium" });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hoja</TableHead>
          <TableHead className="hidden sm:table-cell">Consumidor</TableHead>
          <TableHead>Respuesta</TableHead>
          <TableHead className="hidden sm:table-cell">Fecha límite</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sheets.map((sheet) => (
          <TableRow key={sheet.id} className="cursor-pointer" onClick={() => onOpen(sheet.id)}>
            <TableCell>
              <Link
                to="/complaints/$complaintId"
                params={{ complaintId: sheet.id }}
                className="font-mono font-medium underline-offset-4 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {sheet.reference}
              </Link>
              <p className="max-w-40 truncate sm:hidden">{sheet.fullName}</p>
              <p className="text-muted-foreground">
                {categoryLabel(sheet.category)} · {filed.format(new Date(sheet.filedAt))}
              </p>
            </TableCell>
            <TableCell className="hidden max-w-56 truncate sm:table-cell">
              {sheet.fullName}
            </TableCell>
            <TableCell>
              <ResponseBadge
                recorded={sheet.responseStatus === "recorded"}
                overdue={sheet.overdue}
              />
              <p
                className={cn(
                  "mt-1 sm:hidden",
                  sheet.overdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                Límite: {longDate(sheet.dueDate)}
              </p>
              {sheet.email.status === "failed" && (
                <p className="mt-1 text-destructive">Constancia por correo: requiere atención</p>
              )}
            </TableCell>
            <TableCell
              className={cn(
                "hidden sm:table-cell",
                sheet.overdue && "font-medium text-destructive",
              )}
            >
              {longDate(sheet.dueDate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResponseBadge({ recorded, overdue }: { recorded: boolean; overdue: boolean }) {
  if (recorded) return <span className="text-muted-foreground">Respuesta registrada</span>;
  if (overdue)
    return (
      <Badge variant="destructive">
        <CircleAlertIcon />
        Vencida
      </Badge>
    );
  return (
    <Badge variant="outline">
      <ClockIcon />
      Pendiente de respuesta
    </Badge>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Cargando hojas" className="flex flex-col gap-3">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-10" />
      ))}
    </div>
  );
}

export function ComplaintBackupPage() {
  const owner = useSession().data?.role === "owner";
  const navigate = useNavigate();
  if (!owner) return OWNER_REQUIRED;
  return (
    <main className="flex flex-1 flex-col overflow-auto p-4 text-xs/relaxed lg:p-6">
      <BookCrumb page="Transcribir respaldo físico" />
      <ComplaintBackupForm
        onSaved={(sheet) =>
          void navigate({
            to: "/complaints/$complaintId",
            params: { complaintId: sheet.id },
            replace: true,
          })
        }
      />
    </main>
  );
}

export function ComplaintPage({ id }: { id: string }) {
  const session = useSession();
  const owner = session.data?.role === "owner";
  const accounts = useAccounts(owner);
  const detail = useComplaint(id);
  if (!owner) return OWNER_REQUIRED;
  const author: AuthorName = (accountId) =>
    accounts.data?.find((account) => account.id === accountId)?.username ?? accountId;
  return (
    <main className="flex flex-1 flex-col overflow-auto p-4 text-xs/relaxed lg:p-6">
      <BookCrumb page={detail.data ? `Nº ${detail.data.reference}` : "Hoja"} />
      {detail.isPending && <DetailSkeleton />}
      {detail.error && !detail.data && (
        <PageError
          error={detail.error}
          onRetry={() => void detail.refetch()}
          notFound={{
            title: "No se encontró la hoja",
            description: "Esta hoja no existe en el Libro de Reclamaciones.",
            action: (
              <Button variant="outline" nativeButton={false} render={<Link to="/complaints" />}>
                Volver al libro
              </Button>
            ),
          }}
        />
      )}
      {detail.data && <ComplaintDetail key={id} sheet={detail.data} author={author} />}
    </main>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Cargando hoja" className="flex flex-col gap-6">
      <Skeleton className="h-12 w-80 max-w-full" />
      <Skeleton className="h-14" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-8">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
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
  const format = new Intl.DateTimeFormat("es-PE", {
    timeZone: sheet.timeZone,
    dateStyle: "medium",
  });
  return (value: string) => format.format(new Date(value));
}

function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-3", className)}>{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="wrap-anywhere whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

const panels = {
  sheet: {
    Root: Sheet,
    Content: SheetContent,
    Header: SheetHeader,
    Title: SheetTitle,
    Description: SheetDescription,
  },
  drawer: {
    Root: Drawer,
    Content: DrawerContent,
    Header: DrawerHeader,
    Title: DrawerTitle,
    Description: DrawerDescription,
  },
};

function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean, details: { cancel: () => void }) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  const [asDrawer, setAsDrawer] = useState(mobile);
  if (!open && asDrawer !== mobile) setAsDrawer(mobile);
  const { Root, Content, Header, Title, Description } = asDrawer ? panels.drawer : panels.sheet;
  return (
    <Root {...(asDrawer ? { showSwipeHandle: true } : {})} open={open} onOpenChange={onOpenChange}>
      <Content
        className={cn(
          "overflow-hidden",
          asDrawer
            ? "data-[swipe-axis=y]:max-h-[90dvh] pb-[env(safe-area-inset-bottom)]"
            : "data-[side=right]:sm:max-w-md",
        )}
      >
        <Header className="shrink-0 border-b pr-12">
          <Title>{title}</Title>
          {description && <Description className="wrap-anywhere">{description}</Description>}
        </Header>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 select-text">
          {children}
        </div>
      </Content>
    </Root>
  );
}

function DetailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="flex scroll-mt-6 flex-col gap-3">
      <h2 id={`${id}-title`} className="text-sm font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ComplaintDetail({ sheet, author }: { sheet: ComplaintSheet; author: AuthorName }) {
  const [responseOpen, setResponseOpen] = useState(false);
  const { input } = sheet;
  return (
    <article className="flex w-full flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Hoja <span className="whitespace-nowrap">Nº {sheet.reference}</span>
          </h1>
          <p className="text-muted-foreground">
            {categoryLabel(input.category)} ·{" "}
            <span className="font-medium wrap-anywhere text-foreground">{input.fullName}</span> ·{" "}
            {sheetDateFormatter(sheet)(sheet.filedAt)}
            {sheet.source === "physical" && " · Respaldo físico"}
          </p>
        </div>
        <ResponseStatus sheet={sheet} onRespond={() => setResponseOpen(true)} />
      </header>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-label="Hoja del consumidor" className="flex flex-col gap-5">
            <Facts className="gap-5">
              <Fact label="Detalle">
                <span className="text-sm">{input.description}</span>
              </Fact>
              <Fact label="Pedido">
                <span className="text-sm">{input.requestedRemedy}</span>
              </Fact>
            </Facts>
            <Facts className="flex flex-wrap gap-x-8 gap-y-3">
              <Fact label="Producto o servicio">{input.product}</Fact>
              {input.amountCents != null && (
                <Fact label="Monto">{formatMoney(input.amountCents, sheet.currency)}</Fact>
              )}
              {input.reservationReference && (
                <Fact label="Referencia de reserva">{input.reservationReference}</Fact>
              )}
            </Facts>
          </section>
          <Responses sheet={sheet} author={author} onRespond={() => setResponseOpen(true)} />
        </div>
        <aside
          aria-label="Datos de la hoja"
          className="flex min-w-0 flex-col gap-6 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
        >
          <SheetDetails sheet={sheet} />
        </aside>
      </div>
      <ResponseForm sheet={sheet} open={responseOpen} onOpenChange={setResponseOpen} />
    </article>
  );
}

function ResponseStatus({ sheet, onRespond }: { sheet: ComplaintSheet; onRespond: () => void }) {
  const { overdue } = sheet;
  const latest = sheet.responses
    .filter((response) => !response.voided)
    .reduce<ComplaintSheet["responses"][number] | undefined>(
      (last, response) => (!last || response.sentOn > last.sentOn ? response : last),
      undefined,
    );
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border px-3 py-2.5",
          !latest && overdue && "border-destructive/40 bg-destructive/5",
        )}
      >
        {latest ? (
          <p className="flex min-w-0 items-start gap-2">
            <CircleCheckIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">Respuesta registrada</span>
              <span className="text-muted-foreground">
                {" "}
                · última enviada el {longDate(latest.sentOn)}
              </span>
            </span>
          </p>
        ) : (
          <p className="flex min-w-0 flex-wrap items-center gap-2">
            <ResponseBadge recorded={false} overdue={overdue} />
            <span className={cn(overdue ? "text-destructive" : "text-muted-foreground")}>
              Responder por {channelLabel(sheet.input.responseChannel).toLowerCase()} hasta el{" "}
              {longDate(sheet.dueDate)}
            </span>
          </p>
        )}
        {!latest && (
          <Button size="sm" onClick={onRespond}>
            Registrar respuesta
          </Button>
        )}
      </div>
      {sheet.email.status === "failed" && (
        <p className="flex flex-wrap items-center gap-x-2 text-destructive">
          <CircleAlertIcon aria-hidden className="size-3.5" />
          La constancia por correo requiere atención.
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            nativeButton={false}
            render={<a href="#complaint-receipt" />}
          >
            Revisar
          </Button>
        </p>
      )}
    </div>
  );
}

function SheetDetails({ sheet }: { sheet: ComplaintSheet }) {
  const date = sheetDateFormatter(sheet);
  const { input } = sheet;
  const receipt = sheet.email.status !== "not_requested" && <ReceiptEmails sheet={sheet} />;
  const receiptFailed = sheet.email.status === "failed";
  return (
    <>
      {receiptFailed && receipt}
      <DetailSection id="complaint-consumer" title="Consumidor">
        <Facts>
          <Fact label="Documento">
            {[input.documentType, input.documentNumber].filter(Boolean).join(" · ")}
          </Fact>
          <Fact label="Domicilio">{input.address}</Fact>
          {input.email && <Fact label="Correo">{input.email}</Fact>}
          {input.phone && <Fact label="Teléfono">{input.phone}</Fact>}
          {input.minor && (
            <Fact label="Menor de edad · padre o representante">{input.representative || "—"}</Fact>
          )}
          <Fact label="Respuesta por">
            {channelLabel(input.responseChannel)} · {languageLabel(input.language)}
          </Fact>
        </Facts>
      </DetailSection>
      <DetailSection id="complaint-record" title="Registro">
        <Facts>
          <Fact label="Presentada">{date(sheet.filedAt)}</Fact>
          <Fact label="Fecha límite de respuesta">{longDate(sheet.dueDate)}</Fact>
          {sheet.source === "physical" && (
            <>
              <Fact label="Número de la hoja física">{sheet.originalReference}</Fact>
              {sheet.restoredAt && <Fact label="Restaurada">{date(sheet.restoredAt)}</Fact>}
            </>
          )}
        </Facts>
      </DetailSection>
      {!receiptFailed && receipt}
    </>
  );
}

function attachmentCount(count: number) {
  if (count === 0) return "—";
  return count === 1 ? "1 archivo" : `${count} archivos`;
}

function Responses({
  sheet,
  author,
  onRespond,
}: {
  sheet: ComplaintSheet;
  author: AuthorName;
  onRespond: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const date = sheetDateFormatter(sheet);
  const shown = sheet.responses.find((response) => response.id === (openId ?? shownId));
  function open(id: string) {
    setOpenId(id);
    setShownId(id);
  }
  return (
    <section aria-labelledby="complaint-responses" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="complaint-responses" className="text-sm font-medium">
          Respuestas enviadas
        </h2>
        <Button size="sm" variant="outline" onClick={onRespond}>
          <PlusIcon aria-hidden />
          Agregar respuesta
        </Button>
      </div>
      {sheet.responses.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SendIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Aún no hay respuestas enviadas</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Enviada</TableHead>
              <TableHead className="hidden w-20 sm:table-cell">Canal</TableHead>
              <TableHead>Destinatario</TableHead>
              <TableHead className="w-24 text-right">Evidencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.responses.map((response) => (
              <TableRow
                key={response.id}
                className={cn("cursor-pointer", response.voided && "text-muted-foreground")}
                onClick={() => open(response.id)}
              >
                <TableCell>
                  <button
                    type="button"
                    className={cn(
                      "font-medium underline-offset-4 hover:underline",
                      response.voided && "line-through",
                    )}
                    aria-label={`Ver respuesta del ${longDate(response.sentOn)}${response.voided ? " (anulada)" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      open(response.id);
                    }}
                  >
                    {longDate(response.sentOn)}
                  </button>
                  <p className="text-muted-foreground sm:hidden">
                    {channelLabel(response.channel)}
                    {response.voided && " · Anulada"}
                  </p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {channelLabel(response.channel)}
                </TableCell>
                <TableCell className="truncate">
                  {response.voided && (
                    <Badge variant="outline" className="mr-2 hidden sm:inline-flex">
                      Anulada
                    </Badge>
                  )}
                  <span className={cn(response.voided && "line-through")}>
                    {response.recipient}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right",
                    response.attachments.length === 0 && "text-muted-foreground",
                  )}
                >
                  {attachmentCount(response.attachments.length)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SidePanel
        open={openId !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        title={shown ? `Respuesta del ${longDate(shown.sentOn)}` : "Respuesta"}
        description={shown ? `${channelLabel(shown.channel)} · Para ${shown.recipient}` : ""}
      >
        {shown && (
          <>
            {shown.voided && (
              <Alert>
                <BanIcon aria-hidden />
                <AlertTitle>Respuesta anulada</AlertTitle>
                <AlertDescription>
                  <p className="wrap-anywhere whitespace-pre-wrap">{shown.voided.reason}</p>
                  <p>
                    {date(shown.voided.voidedAt)} · {author(shown.voided.voidedBy)}
                  </p>
                </AlertDescription>
              </Alert>
            )}
            <p
              className={cn(
                "text-sm wrap-anywhere whitespace-pre-wrap",
                shown.voided && "text-muted-foreground line-through",
              )}
            >
              {shown.text}
            </p>
            <Facts>
              <Fact label="Referencia de evidencia">{shown.evidence}</Fact>
              <Fact label="Registrada">
                {date(shown.recordedAt)} · {author(shown.recordedBy)}
              </Fact>
              {shown.correctsId && (
                <Fact label="Corrección">Corrige el registro {shown.correctsId}</Fact>
              )}
            </Facts>
            <ComplaintResponseAttachments
              complaintId={sheet.id}
              responseId={shown.id}
              attachments={shown.attachments}
              readOnly={Boolean(shown.voided)}
            />
            {!shown.voided && <VoidResponse key={shown.id} sheet={sheet} responseId={shown.id} />}
          </>
        )}
      </SidePanel>
    </section>
  );
}

function VoidResponse({ sheet, responseId }: { sheet: ComplaintSheet; responseId: string }) {
  const save = useVoidComplaintResponse(sheet.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button className="w-fit" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Anular respuesta
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (save.isPending) return;
          setOpen(next);
          if (!next) {
            save.reset();
            setReason("");
          }
        }}
      >
        <AlertDialogContent>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(
                { responseId, reason },
                {
                  onSuccess: () => {
                    setOpen(false);
                    toast.success("Respuesta anulada");
                  },
                },
              );
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>¿Anular esta respuesta?</AlertDialogTitle>
              <AlertDialogDescription>
                Dejará de contar como respuesta de la hoja. No se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field data-disabled={save.isPending}>
              <FieldLabel htmlFor="complaint-void-reason">Motivo</FieldLabel>
              <Textarea
                id="complaint-void-reason"
                className="min-h-20"
                value={reason}
                disabled={save.isPending}
                onChange={(event) => {
                  save.reset();
                  setReason(event.target.value);
                }}
                required
                maxLength={2000}
                autoFocus
              />
            </Field>
            {save.error && (
              <p role="alert" className="text-destructive">
                No se pudo anular la respuesta. {problemText(save.error)}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={save.isPending}>Cancelar</AlertDialogCancel>
              <Button
                variant="destructive"
                type="submit"
                disabled={save.isPending || !reason.trim()}
              >
                {save.isPending ? "Anulando…" : "Anular respuesta"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReceiptEmails({ sheet }: { sheet: ComplaintSheet }) {
  const copy = useComplaintReceiptCopy(sheet.id);
  const requestId = useRef(crypto.randomUUID());
  const date = sheetDateFormatter(sheet);
  const failed = sheet.email.status === "failed";
  return (
    <DetailSection id="complaint-receipt" title="Constancia por correo">
      <p className={cn(failed ? "font-medium text-destructive" : "text-muted-foreground")}>
        {emailStatus(sheet.email)}
      </p>
      {sheet.emails.length > 1 && (
        <ol className="flex flex-col gap-2">
          {sheet.emails.map((email) => (
            <li key={email.id} className="flex flex-col">
              <span>
                {email.kind === "copy" ? "Copia adicional" : "Envío automático"} ·{" "}
                {emailStatus(email)}
              </span>
              <span className="text-muted-foreground">
                {date(email.createdAt)}
                {email.sentAt && ` · aceptado ${date(email.sentAt)}`}
              </span>
            </li>
          ))}
        </ol>
      )}
      {failed && (
        <div className="flex flex-col gap-2">
          <Button
            className="w-fit"
            variant="outline"
            size="sm"
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
      {copy.error && (
        <p role="alert" className="text-destructive">
          {problemText(copy.error)}
        </p>
      )}
    </DetailSection>
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
  open,
  onOpenChange,
}: {
  sheet: ComplaintSheet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useComplaintResponse(sheet.id);
  const attach = useComplaintAttachment(sheet.id);
  const defaultRecipient = (channel: string) =>
    (channel === "email" ? sheet.input.email : sheet.input.address) ?? "";
  const blank = {
    text: "",
    channel: sheet.input.responseChannel,
    recipient: defaultRecipient(sheet.input.responseChannel),
    sentOn: "",
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
  const [dateMissing, setDateMissing] = useState(false);
  const { today } = usePropertyCalendar();
  const running = useRef(false);
  const awaitingEvidence = savedResponseId !== null;
  useBlocker({
    shouldBlockFn: () => awaitingEvidence && !window.confirm(LEAVE_WITHOUT_EVIDENCE),
    enableBeforeUnload: () => awaitingEvidence,
  });
  function update(key: keyof typeof draft, value: string) {
    if (!command.current) setDraft({ ...draft, [key]: value });
  }
  function changeChannel(channel: string) {
    if (command.current) return;
    setDraft({
      ...draft,
      channel: channel as typeof draft.channel,
      recipient:
        draft.recipient === defaultRecipient(draft.channel)
          ? defaultRecipient(channel)
          : draft.recipient,
    });
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
    onOpenChange(false);
    toast.success(message);
  }
  async function submit() {
    if (running.current) return;
    running.current = true;
    try {
      let responseId = savedResponseId;
      if (!responseId) {
        if (!draft.sentOn) return setDateMissing(true);
        command.current ??= {
          requestId: crypto.randomUUID(),
          text: draft.text,
          channel: draft.channel,
          recipient: draft.recipient,
          sentOn: draft.sentOn,
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
    <SidePanel
      open={open}
      onOpenChange={(next, details) => {
        if (!next && (busy || awaitingEvidence)) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
      title="Registrar respuesta enviada"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy || locked}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <ChoiceField
                id="complaint-response-channel"
                label="Canal"
                value={draft.channel}
                disabled={busy || locked}
                onChange={changeChannel}
                options={[
                  { value: "email", label: "Correo" },
                  { value: "letter", label: "Carta" },
                ]}
              />
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
            </div>
            <TextField
              id="complaint-sent"
              label="Fecha de envío"
              type="date"
              min={dayInZone(sheet.filedAt, sheet.timeZone)}
              max={today}
              value={draft.sentOn}
              disabled={busy || locked}
              error={dateMissing ? "Seleccione la fecha de envío." : undefined}
              onChange={(value) => {
                setDateMissing(false);
                update("sentOn", value);
              }}
            />
            <Field>
              <FieldLabel htmlFor="complaint-response">Respuesta enviada</FieldLabel>
              <Textarea
                id="complaint-response"
                className="min-h-32"
                value={draft.text}
                onChange={(event) => update("text", event.target.value)}
                required
                maxLength={10000}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="complaint-evidence">Referencia de evidencia</FieldLabel>
              <Input
                id="complaint-evidence"
                name="evidence"
                required
                maxLength={2000}
                placeholder={
                  draft.channel === "email" ? "Asunto o ID del mensaje" : "Nº de guía postal"
                }
                value={draft.evidence}
                onChange={(event) => update("evidence", event.target.value)}
              />
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
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
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
        {fileProblem && (
          <p role="alert" className="text-destructive">
            {fileProblem}
          </p>
        )}
        {busy && (
          <p role="status">
            {step === "saving" ? "Guardando respuesta…" : "Adjuntando evidencia…"}
          </p>
        )}
        {save.error && !awaitingEvidence && !busy && (
          <p role="alert" className="text-destructive">
            No se pudo guardar la respuesta. {problemText(save.error)}
          </p>
        )}
        {awaitingEvidence && !busy && (
          <Alert variant="warning">
            <CircleAlertIcon />
            <AlertTitle>La respuesta se guardó, pero no se pudo adjuntar la evidencia.</AlertTitle>
            <AlertDescription>
              <p>
                Si eliges «Adjuntar después», la respuesta seguirá guardada, pero tendrás que
                seleccionar el archivo de nuevo.
              </p>
              {attach.error && <p>{problemText(attach.error)}</p>}
            </AlertDescription>
          </Alert>
        )}
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
    </SidePanel>
  );
}
