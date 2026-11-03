import type { ReactNode } from "react";
import { CopyIcon, CreditCardIcon, LockIcon, PencilIcon, Undo2Icon } from "lucide-react";
import { cn } from "cn";
import { parseISO } from "date-fns";
import { AccountStatusBanner, SummaryRow, accountStatus } from "@/components/balance-status";
import { DiscountPopover } from "@/components/discount-popover";
import { culqiPendingLine } from "@/components/refund-forms";
import { paymentMethods } from "@/components/reservation-entry-forms";
import { RowActions } from "@/components/reservation-records";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReservationDetail, ReservationPayment } from "@/lib/api";
import { copyCouponMessage } from "@/lib/coupon-message";
import { format, longDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { propertyToday } from "@/lib/property-calendar";
import { unsavedMessage, useReservationCommands } from "@/lib/reservation-commands";
import { toast, toastError } from "@/lib/toast";

type Props = {
  detail: ReservationDetail;
  edit: (target: ReservationEditorTarget) => void;
};

export const isReleased = (status: string) =>
  !["confirmed", "checked_in", "checked_out"].includes(status);

const shortDate = (day: string) => format(parseISO(day), "d MMM yyyy");
const methodLabel = (method: string) =>
  paymentMethods.find((entry) => entry.value === method)?.label ?? method;

export function AccountCard({
  detail,
  edit,
  onDiscountDraftChange,
}: Props & { onDiscountDraftChange?: (changed: boolean) => void }) {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const status = accountStatus(detail);
  const owing = status.state === "owing";
  return (
    <Card className="min-w-0" role="region" aria-label="Cuenta">
      <CardHeader>
        <CardTitle>
          <h2>Cuenta</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <AccountSummary detail={detail} edit={edit} onDiscountDraftChange={onDiscountDraftChange} />
        <section aria-label="Estado de la cuenta" className="flex flex-col gap-3">
          <AccountStatusBanner status={status} amount={money(status.cents)} />
          {owing && (
            <Button className="w-full" onClick={() => edit({ kind: "payment" })}>
              <CreditCardIcon data-icon="inline-start" />
              Registrar pago
            </Button>
          )}
          {status.state === "owed-back" && (
            <Button className="w-full" onClick={() => edit({ kind: "refund" })}>
              <Undo2Icon data-icon="inline-start" />
              Devolver…
            </Button>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export function MovementsCard({ detail, edit }: Props) {
  return (
    <Card className="@container/mov min-w-0" role="region" aria-label="Movimientos">
      <CardHeader>
        <CardTitle>
          <h2>Movimientos</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        <Movements detail={detail} edit={edit} resolveRefunds />
      </CardContent>
    </Card>
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
      toast.add({ title: "Cambios guardados", type: "success" });
      return true;
    }
    toastError("No se pudo guardar", unsavedMessage(result));
    return false;
  }
  return (
    <dl aria-label="Resumen de la cuenta" className="flex flex-col gap-2">
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
      <SummaryRow
        label={<span className="font-medium">Total</span>}
        value={money(detail.totalCents)}
      />
      <SummaryRow label="Pagado" value={money(detail.paidCents)} />
      {detail.couponAppliedCents > 0 && (
        <SummaryRow label="Pagado con cupón" value={money(detail.couponAppliedCents)} />
      )}
      {detail.refundedCents > 0 && (
        <SummaryRow label="Reembolsado" value={minus(detail.refundedCents)} />
      )}
      {detail.couponIssuedCents > 0 && (
        <SummaryRow
          label="Pasado a cupón"
          value={minus(detail.couponIssuedCents)}
          note={detail.coupons.map((coupon) => (
            <span key={coupon.id} className="flex items-center gap-1">
              <span>
                <span className="font-mono">{coupon.code}</span> · Vence el{" "}
                {longDate(coupon.expiresOn)}
                {coupon.balanceCents === 0
                  ? " · Usado"
                  : coupon.balanceCents < coupon.valueCents
                    ? ` · Quedan ${money(coupon.balanceCents)}`
                    : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Copiar mensaje del cupón ${coupon.code}`}
                title="Copiar mensaje"
                onClick={() => void copyCouponMessage(coupon, detail.currency, { announce: true })}
              >
                <CopyIcon />
              </Button>
            </span>
          ))}
        />
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
  if (!rows.length) return <p className="py-3 text-muted-foreground">Sin movimientos todavía.</p>;
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
