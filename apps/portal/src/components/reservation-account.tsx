import type { ReactNode } from "react";
import { CreditCardIcon, LockIcon, PencilIcon, ReceiptIcon, Undo2Icon } from "lucide-react";
import { cn } from "cn";
import { parseISO } from "date-fns";
import { SummaryRow, accountStatus } from "@/components/balance-status";
import { DiscountPopover } from "@/components/discount-popover";
import { culqiPendingLine } from "@/components/refund-forms";
import { paymentMethods } from "@/components/reservation-entry-forms";
import { RowActions } from "@/components/reservation-records";
import { ReservationSection, SectionHeading } from "@/components/reservation-section";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
  onDiscountDraftChange,
}: Props & { onDiscountDraftChange?: (changed: boolean) => void }) {
  return (
    <section role="region" aria-label="Cuenta" className="flex min-w-0 flex-col">
      <AccountBalance detail={detail} edit={edit} />
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <SectionHeading title="Cuenta" />
        <AccountSummary detail={detail} edit={edit} onDiscountDraftChange={onDiscountDraftChange} />
      </div>
    </section>
  );
}

function AccountBalance({ detail, edit }: Props) {
  const status = accountStatus(detail);
  return (
    <section
      aria-label="Estado de la cuenta"
      className={cn("flex flex-col gap-1 px-4 py-6", status.tone)}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <status.Icon aria-hidden className="size-3.5" />
        {status.label}
      </p>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">
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

type Movement = {
  key: string;
  at: string;
  date: string;
  label: ReactNode;
  method: string;
  reference: string | null;
  amount: ReactNode;
  muted?: boolean;
  action: ReactNode;
};

function paymentLock(detail: ReservationDetail, payment: ReservationPayment) {
  if (payment.culqiChargeId) return "Pago en línea: no se puede editar";
  if (detail.refunds.some((refund) => refund.paymentId === payment.id))
    return "Tiene reembolsos: no se puede editar";
  if (detail.couponIssuedCents > 0) return "Se emitió un cupón: no se puede editar";
  return null;
}

function movements(
  detail: ReservationDetail,
  edit: Props["edit"],
  disabled: boolean,
  resolveRefunds: boolean,
): Movement[] {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const rows: Movement[] = [];
  for (const payment of detail.payments) {
    const lock = paymentLock(detail, payment);
    rows.push({
      key: payment.id,
      at: payment.createdAt,
      date: payment.paymentDate,
      label: payment.culqiChargeId ? (
        <span className="inline-flex items-center gap-1.5">
          Pago <Badge variant="secondary">En línea</Badge>
        </span>
      ) : (
        "Pago"
      ),
      method: payment.culqiChargeId ? "Tarjeta" : methodLabel(payment.method),
      reference: payment.reference,
      amount: money(payment.amountCents),
      action: lock ? (
        <span role="img" aria-label={lock} title={lock} className="inline-flex px-2">
          <LockIcon aria-hidden className="size-3.5 text-muted-foreground" />
        </span>
      ) : (
        <RowActions
          label={`Acciones del pago de ${money(payment.amountCents)} del ${payment.paymentDate}`}
          disabled={disabled}
          onEdit={() => edit({ kind: "payment", id: payment.id })}
          onDelete={() => edit({ kind: "delete-payment", id: payment.id })}
        />
      ),
    });
  }
  for (const refund of detail.refunds) {
    const amount = money(refund.amountCents);
    rows.push({
      key: refund.id,
      at: refund.requestedAt,
      date: refund.refundDate ?? propertyToday(new Date(refund.requestedAt)),
      label: (
        <>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Reembolso
            {refund.status === "requested" && <Badge variant="preview">Solicitado</Badge>}
            {refund.status === "failed" && <Badge variant="secondary">Fallido</Badge>}
          </span>
          {refund.status === "requested" && refund.culqiChargeId && (
            <span className="mt-1 block text-xs text-muted-foreground">{culqiPendingLine}</span>
          )}
        </>
      ),
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
      action:
        resolveRefunds && refund.status === "requested" ? (
          <RowActions
            label={`Acciones del reembolso de ${amount}`}
            disabled={disabled}
            editLabel="Confirmar reembolso"
            deleteLabel="Marcar como fallido"
            onEdit={() => edit({ kind: "resolve-refund", id: refund.id, failing: false })}
            onDelete={() => edit({ kind: "resolve-refund", id: refund.id, failing: true })}
          />
        ) : null,
    });
  }
  for (const movement of detail.couponMovements)
    rows.push({
      key: movement.id,
      at: movement.recordedAt,
      date: movement.recordedOn,
      label: { issue: "Cupón emitido", redeem: "Cupón aplicado", return: "Devuelto al cupón" }[
        movement.kind
      ],
      method: "Cupón",
      reference: movement.code,
      amount: money(movement.kind === "redeem" ? movement.amountCents : -movement.amountCents),
      action: null,
    });
  return rows.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}

export function Movements({
  detail,
  edit,
  disabled = false,
  resolveRefunds = false,
}: Props & { disabled?: boolean; resolveRefunds?: boolean }) {
  const rows = movements(detail, edit, disabled, resolveRefunds);
  if (!rows.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptIcon />
          </EmptyMedia>
          <EmptyTitle>Sin movimientos todavía</EmptyTitle>
          <EmptyDescription>Los pagos, reembolsos y cupones aparecerán aquí.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <Table aria-label="Movimientos">
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Movimiento</TableHead>
          <TableHead className="@max-sm/mov:hidden">Método</TableHead>
          <TableHead className="@max-lg/mov:hidden">Referencia</TableHead>
          <TableHead className="text-right">Importe</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className={cn(row.muted && "text-muted-foreground")}>
            <TableCell className="text-muted-foreground">{shortDate(row.date)}</TableCell>
            <TableCell className="whitespace-normal">{row.label}</TableCell>
            <TableCell className="@max-sm/mov:hidden">{row.method}</TableCell>
            <TableCell className="max-w-40 font-mono text-xs break-words whitespace-normal @max-lg/mov:hidden">
              {row.reference?.toUpperCase() || "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.amount}</TableCell>
            <TableCell className="text-right">{row.action}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
