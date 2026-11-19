import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  ChevronUpIcon,
  CreditCardIcon,
  LockIcon,
  PencilIcon,
  ReceiptIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { parseISO } from "date-fns";
import { SummaryRow, accountStatus } from "@/components/balance-status";
import { DiscountPopover } from "@/components/discount-popover";
import { culqiPendingLine } from "@/components/refund-forms";
import { paymentMethods } from "@/components/reservation-entry-forms";
import { ReservationSection, SectionHeading } from "@/components/reservation-section";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import { useResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { useLifecycleAction } from "@/components/lifecycle-action";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReservationDetail, ReservationPayment } from "@/lib/api";
import { format } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { propertyToday } from "@/lib/property-calendar";
import { holdsInventory } from "@/lib/reservation-statuses";
import { unsavedMessage, useReservationCommands } from "@/lib/reservation-commands";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";

type Props = {
  detail: ReservationDetail;
  edit: (target: ReservationEditorTarget) => void;
};

export const isReleased = (status: string) => !holdsInventory(status);

const shortDate = (day: string) => format(parseISO(day), "d MMM yyyy");
const methodLabel = (method: string) =>
  paymentMethods.find((entry) => entry.value === method)?.label ?? method;

export function AccountPanel({
  detail,
  edit,
  stacked,
  disabled,
  lifecycle,
  lifecycleBlocked,
  onHeightChange,
  onDiscountDraftChange,
}: Props & {
  stacked: boolean;
  disabled: boolean;
  lifecycle: ReturnType<typeof useLifecycleAction>;
  lifecycleBlocked: boolean;
  onHeightChange: (height: number) => void;
  onDiscountDraftChange?: (changed: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [discountBlocking, setDiscountBlocking] = useState(false);
  const discountChange = useCallback(
    (changed: boolean) => {
      setDiscountBlocking(changed);
      onDiscountDraftChange?.(changed);
    },
    [onDiscountDraftChange],
  );
  const footer = useRef<HTMLElement>(null);
  const status = accountStatus(detail);
  const payment =
    status.state === "owing" ? "payment" : status.state === "owed-back" ? "refund" : null;
  const lifecyclePrimary = lifecycle.step && (lifecycle.step.due || !payment);
  useLayoutEffect(() => {
    if (!stacked || !footer.current) return;
    const element = footer.current;
    const measure = () => onHeightChange(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [stacked, onHeightChange]);
  return (
    <section
      ref={footer}
      role="region"
      aria-label="Cuenta"
      className={cn(
        "flex min-w-0 flex-col",
        stacked &&
          "fixed inset-x-0 bottom-0 z-20 gap-3 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:right-auto md:left-(--reservation-content-left) md:w-(--reservation-content-width) md:px-6",
      )}
    >
      {!stacked && <AccountBalance detail={detail} edit={edit} />}
      <Collapsible open={!stacked || expanded} onOpenChange={setExpanded}>
        <CollapsibleContent
          keepMounted
          className={cn(
            "motion-reduce:transition-none",
            stacked &&
              "h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col gap-3",
              stacked
                ? "max-h-[min(35dvh,20rem)] overflow-y-auto overscroll-contain pt-1 pb-3"
                : "px-6 pb-5",
            )}
          >
            {!stacked && <SectionHeading title="Cuenta" />}
            <AccountSummary detail={detail} edit={edit} onDiscountDraftChange={discountChange} />
          </div>
          {stacked && <Separator />}
        </CollapsibleContent>
        {stacked && <BalanceToggle detail={detail} disabled={disabled || discountBlocking} />}
      </Collapsible>
      {stacked && (payment || lifecycle.step) && (
        <div
          aria-label="Acciones de la reserva"
          className={cn("grid gap-2", payment && lifecycle.step && "grid-cols-2")}
        >
          {payment && (
            <Button
              size="lg"
              variant={lifecyclePrimary ? "outline" : "default"}
              disabled={disabled || lifecycle.running}
              onClick={() => edit({ kind: payment })}
            >
              {payment === "payment" ? (
                <CreditCardIcon data-icon="inline-start" />
              ) : (
                <Undo2Icon data-icon="inline-start" />
              )}
              {payment === "payment" ? "Registrar pago" : "Devolver"}
            </Button>
          )}
          {lifecycle.step && (
            <Button
              size="lg"
              variant={lifecyclePrimary ? "default" : "outline"}
              disabled={disabled || lifecycleBlocked || lifecycle.running}
              onClick={() => void lifecycle.run()}
            >
              {lifecycle.step.label}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function BalanceToggle({
  detail,
  disabled,
}: {
  detail: ReservationDetail;
  disabled?: boolean;
}) {
  const status = accountStatus(detail);
  return (
    <h2>
      <CollapsibleTrigger
        disabled={disabled}
        className="group flex min-h-11 w-full items-center justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "text-xs font-medium",
            status.state === "owing" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {status.label}
        </span>{" "}
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(status.cents, detail.currency)}
          </span>
          <ChevronUpIcon
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </CollapsibleTrigger>
    </h2>
  );
}

export const balanceTone = {
  owing: "text-destructive",
  "owed-back": "text-credit-foreground",
  "refund-requested": "text-preview-foreground",
  settled: "text-booking-foreground",
} satisfies Record<ReturnType<typeof accountStatus>["state"], string>;

function AccountBalance({ detail, edit }: Props) {
  const status = accountStatus(detail);
  const textTone = balanceTone[status.state];
  return (
    <section aria-label="Estado de la cuenta" className="flex flex-col gap-1 px-6 pt-6 pb-5">
      <p className={cn("flex items-center gap-1.5 text-xs font-medium", textTone)}>
        <status.Icon aria-hidden className="size-3.5" />
        {status.label}
      </p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {formatMoney(status.cents, detail.currency)}
      </p>
      {status.state === "owing" && (
        <Button className="mt-2 w-full" onClick={() => edit({ kind: "payment" })}>
          <CreditCardIcon data-icon="inline-start" />
          Registrar pago
        </Button>
      )}
      {status.state === "owed-back" && (
        <Button className="mt-2 w-full" onClick={() => edit({ kind: "refund" })}>
          <Undo2Icon data-icon="inline-start" />
          Devolver…
        </Button>
      )}
    </section>
  );
}

export function MovementsSection({ detail, edit }: Props) {
  return (
    <ReservationSection title="Movimientos" className="@container/mov">
      <Movements detail={detail} edit={edit} resolveRefunds />
    </ReservationSection>
  );
}

function AccountSummary({
  detail,
  edit,
  onDiscountDraftChange,
}: {
  detail: ReservationDetail;
  edit: Props["edit"];
  onDiscountDraftChange?: (changed: boolean) => void;
}) {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const minus = (cents: number) => money(cents ? -cents : 0);
  const { send } = useReservationCommands(detail.id);
  const cancellation = detail.cancellation;
  async function applyDiscount(amountCents: number) {
    const result = await send([{ type: "set-discount", amountCents }]);
    if (result.status === "saved") {
      toast.success("Cambios guardados");
      return true;
    }
    toastError("No se pudo guardar", unsavedMessage(result));
    return false;
  }
  return (
    <dl aria-label="Resumen de la cuenta" className="flex flex-col gap-2 text-xs">
      {isReleased(detail.status) ? (
        <>
          <SummaryRow
            label={
              <span className="inline-flex items-center gap-1">
                {(cancellation?.outcome ?? detail.status) === "no_show"
                  ? "Cargo por no presentarse"
                  : "Cargo por cancelación"}
                {(detail.status === "cancelled" || detail.status === "no_show") &&
                  cancellation &&
                  cancellation.finalChargeCents > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Perdonar cargo"
                      title="Perdonar cargo"
                      onClick={() => edit({ kind: "waiver" })}
                    >
                      <PencilIcon />
                    </Button>
                  )}
              </span>
            }
            value={money(cancellation?.policyChargeCents ?? detail.totalCents)}
          />
          {cancellation?.waivers.map((waiver) => (
            <SummaryRow key={waiver.id} label="Cargo perdonado" value={minus(waiver.amountCents)} />
          ))}
        </>
      ) : (
        <>
          <SummaryRow label="Subtotal" value={money(detail.subtotalCents)} />
          <div>
            <DiscountPopover
              appliedCents={detail.savedDiscountCents}
              shownCents={detail.discountCents}
              currency={detail.currency}
              onApply={applyDiscount}
              onBlockingChange={onDiscountDraftChange}
            />
          </div>
        </>
      )}
      <SummaryRow className="font-medium" label="Total" value={money(detail.totalCents)} />
      <SummaryRow label="Pagado" value={money(detail.paidCents)} />
      {detail.couponAppliedCents > 0 && (
        <SummaryRow label="Pagado con cupón" value={money(detail.couponAppliedCents)} />
      )}
      {detail.refundedCents > 0 && (
        <SummaryRow label="Reembolsado" value={minus(detail.refundedCents)} />
      )}
      {detail.couponIssuedCents > 0 && (
        <SummaryRow label="Pasado a cupón" value={minus(detail.couponIssuedCents)} />
      )}
    </dl>
  );
}

type MovementFact = { label: string; value: ReactNode };
type MovementAction = { label: string; destructive?: boolean; target: ReservationEditorTarget };
type Movement = {
  key: string;
  at: string;
  date: string;
  kind: string;
  hint?: ReactNode;
  summary: string;
  method: string;
  reference: string | null;
  amount: ReactNode;
  muted?: boolean;
  facts: MovementFact[];
  actions: MovementAction[];
  lock?: string | null;
};

function paymentLock(detail: ReservationDetail, payment: ReservationPayment) {
  if (payment.culqiChargeId) return "Pago en línea: no se puede anular";
  if (detail.refunds.some((refund) => refund.paymentId === payment.id))
    return "Tiene reembolsos: no se puede anular";
  if (detail.couponIssuedCents > 0) return "Se emitió un cupón: no se puede anular";
  return null;
}

const code = (value: string) => <span className="font-mono">{value.toUpperCase()}</span>;
const present = (facts: (MovementFact | false | null | "")[]) =>
  facts.filter((fact): fact is MovementFact => Boolean(fact));
const recorded = (label: string, at: string | null, by: string | null) =>
  at
    ? present([
        { label, value: shortDate(propertyToday(new Date(at))) },
        by && { label: `${label} por`, value: by },
      ])
    : [];

function movements(detail: ReservationDetail, resolveRefunds: boolean): Movement[] {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const rows: Movement[] = [];
  for (const payment of detail.payments) {
    const amount = money(payment.amountCents);
    const voided = payment.voidedAt !== null;
    const lock = voided ? null : paymentLock(detail, payment);
    const method = payment.culqiChargeId ? "Tarjeta" : methodLabel(payment.method);
    const kind = voided ? "Pago anulado" : payment.culqiChargeId ? "Pago en línea" : "Pago";
    rows.push({
      key: payment.id,
      at: payment.createdAt,
      date: payment.paymentDate,
      kind,
      summary: `${kind.toLowerCase()} de ${amount} del ${shortDate(payment.paymentDate)}`,
      method,
      reference: payment.reference,
      amount: voided ? <del aria-label={`${amount}, anulado`}>{amount}</del> : amount,
      muted: voided,
      facts: [
        ...present([voided && { label: "Motivo de la anulación", value: payment.voidReason }]),
        ...recorded("Anulado", payment.voidedAt, payment.voidedBy),
        ...present([
          { label: "Fecha del pago", value: shortDate(payment.paymentDate) },
          { label: "Método", value: method },
          payment.reference && { label: "Referencia", value: code(payment.reference) },
          payment.notes && { label: "Nota del pago", value: payment.notes },
        ]),
        ...recorded("Registrado", payment.createdAt, payment.recordedBy),
      ],
      actions:
        voided || lock
          ? []
          : [
              {
                label: "Anular pago",
                destructive: true,
                target: { kind: "void-payment", id: payment.id },
              },
            ],
      lock,
    });
  }
  for (const refund of detail.refunds) {
    const amount = money(refund.amountCents);
    const date = refund.refundDate ?? propertyToday(new Date(refund.requestedAt));
    const pendingCulqi = refund.status === "requested" && refund.culqiChargeId;
    const kind = {
      requested: "Reembolso solicitado",
      completed: "Reembolso",
      failed: "Reembolso fallido",
    }[refund.status];
    rows.push({
      key: refund.id,
      at: refund.requestedAt,
      date,
      kind,
      hint: pendingCulqi && (
        <span className="mt-1 block text-xs text-muted-foreground">{culqiPendingLine}</span>
      ),
      summary: `${kind.toLowerCase()} de ${amount} del ${shortDate(date)}`,
      method: methodLabel(refund.method),
      reference: refund.completionReference ?? refund.reference,
      amount:
        refund.status === "completed" ? (
          money(-refund.amountCents)
        ) : refund.status === "failed" ? (
          <del aria-label={`${amount}, no cuenta`}>{amount}</del>
        ) : (
          `(${amount})`
        ),
      muted: refund.status !== "completed",
      facts: [
        ...present([
          pendingCulqi && { label: "Pendiente", value: culqiPendingLine },
          refund.failureReason && { label: "Motivo del fallo", value: refund.failureReason },
          { label: "Motivo", value: refund.reason },
          { label: "Método", value: methodLabel(refund.method) },
          refund.refundDate && {
            label: "Fecha del reembolso",
            value: shortDate(refund.refundDate),
          },
          refund.reference && { label: "Referencia", value: code(refund.reference) },
          refund.completionReference && {
            label: "Referencia de la devolución",
            value: code(refund.completionReference),
          },
        ]),
        ...recorded("Solicitado", refund.requestedAt, refund.requestedBy),
        ...recorded(
          refund.status === "failed" ? "Marcado como fallido" : "Confirmado",
          refund.resolvedAt,
          refund.resolvedBy,
        ),
      ],
      actions:
        resolveRefunds && refund.status === "requested"
          ? [
              {
                label: "Confirmar reembolso",
                target: { kind: "resolve-refund", id: refund.id, failing: false },
              },
              {
                label: "Marcar como fallido",
                destructive: true,
                target: { kind: "resolve-refund", id: refund.id, failing: true },
              },
            ]
          : [],
    });
  }
  for (const movement of detail.couponMovements) {
    const kind = { issue: "Cupón emitido", redeem: "Cupón aplicado", return: "Devuelto al cupón" }[
      movement.kind
    ];
    rows.push({
      key: movement.id,
      at: movement.recordedAt,
      date: movement.recordedOn,
      kind,
      summary: `${kind.toLowerCase()} de ${money(movement.amountCents)} del ${shortDate(movement.recordedOn)}`,
      method: "Cupón",
      reference: movement.code,
      amount: money(movement.kind === "redeem" ? movement.amountCents : -movement.amountCents),
      facts: [
        { label: "Código", value: code(movement.code) },
        { label: "Fecha", value: shortDate(movement.recordedOn) },
        { label: "Vence", value: shortDate(movement.expiresOn) },
        ...recorded("Registrado", movement.recordedAt, movement.recordedBy),
      ],
      actions: [],
    });
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}

export function Movements({
  detail,
  edit,
  disabled = false,
  resolveRefunds = false,
}: Props & { disabled?: boolean; resolveRefunds?: boolean }) {
  const rows = movements(detail, resolveRefunds);
  const [selected, setSelected] = useState<{ key: string; open: boolean } | null>(null);
  const shown = selected && rows.find((row) => row.key === selected.key);
  const open = Boolean(selected?.open && shown);
  const close = () => setSelected((current) => current && { ...current, open: false });
  function run(target: ReservationEditorTarget) {
    close();
    edit(target);
  }
  if (!rows.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptIcon />
          </EmptyMedia>
          <EmptyTitle>Sin movimientos todavía</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  return (
    <>
      <Table aria-label="Movimientos">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Movimiento</TableHead>
            <TableHead className="@max-sm/mov:hidden">Método</TableHead>
            <TableHead className="@max-lg/mov:hidden">Referencia</TableHead>
            <TableHead className="text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.key}
              className={cn("relative cursor-pointer", row.muted && "text-muted-foreground")}
            >
              <TableCell className="text-muted-foreground">{shortDate(row.date)}</TableCell>
              <TableCell className="whitespace-normal">
                <button
                  type="button"
                  aria-label={`Ver ${row.summary}`}
                  className="cursor-pointer rounded-sm text-left outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => setSelected({ key: row.key, open: true })}
                >
                  {row.kind}
                  {row.hint}
                </button>
              </TableCell>
              <TableCell className="@max-sm/mov:hidden">{row.method}</TableCell>
              <TableCell className="max-w-40 font-mono text-xs break-words whitespace-normal @max-lg/mov:hidden">
                {row.reference?.toUpperCase() || "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MovementPanel
        movement={shown ?? null}
        open={open}
        disabled={disabled}
        onClose={close}
        onPick={run}
      />
    </>
  );
}

function MovementPanel({
  movement,
  open,
  disabled,
  onClose,
  onPick,
}: {
  movement: Movement | null;
  open: boolean;
  disabled: boolean;
  onClose: () => void;
  onPick: (target: ReservationEditorTarget) => void;
}) {
  const { asDrawer, surface } = useResponsivePanel(open && movement ? movement.key : null, {
    tabletDrawer: true,
  });
  const { Root, Content, Header, Title, Description, Footer, Close } = surface;
  return (
    <Root
      {...(asDrawer ? { showSwipeHandle: true } : {})}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Content
        {...(asDrawer ? {} : { showCloseButton: false })}
        className={cn(
          "overflow-hidden",
          asDrawer
            ? "data-[swipe-axis=y]:max-h-[85dvh] pb-[env(safe-area-inset-bottom)]"
            : "data-[side=right]:sm:max-w-md",
        )}
      >
        {movement && (
          <>
            <Header className="relative shrink-0 gap-2 border-b p-5 pr-12 group-data-[swipe-axis=y]/drawer-popup:text-left">
              <Title>{movement.kind}</Title>
              <p
                className={cn(
                  "text-2xl font-semibold tracking-tight tabular-nums",
                  movement.muted && "text-muted-foreground",
                )}
              >
                {movement.amount}
              </p>
              <Description className="sr-only">{movement.summary}</Description>
              <Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-3 right-3"
                  />
                }
                aria-label="Cerrar"
              >
                <XIcon />
              </Close>
            </Header>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-5">
              <dl aria-label="Detalle del movimiento" className="flex flex-col gap-3">
                {movement.facts.map((fact) => (
                  <div key={fact.label} className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground">{fact.label}</dt>
                    <dd className="whitespace-pre-wrap wrap-anywhere">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              {movement.lock && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <LockIcon aria-hidden className="size-3.5 shrink-0" />
                  {movement.lock}
                </p>
              )}
            </div>
            {movement.actions.length > 0 && (
              <Footer className="shrink-0 flex-row flex-wrap border-t p-5 [&>button]:flex-1">
                {movement.actions.map((action) => (
                  <Button
                    key={action.label}
                    type="button"
                    variant={action.destructive ? "destructive" : "default"}
                    disabled={disabled}
                    onClick={() => onPick(action.target)}
                  >
                    {action.label}
                  </Button>
                ))}
              </Footer>
            )}
          </>
        )}
      </Content>
    </Root>
  );
}
