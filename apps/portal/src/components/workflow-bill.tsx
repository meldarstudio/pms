import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/lib/money"
import type { WorkflowBilling } from "@/lib/api"
export function WorkflowBill({
  bill,
  compact = false,
}: {
  bill: Omit<WorkflowBilling, "rooms">
  compact?: boolean
}) {
  return (
    <dl className="flex flex-col gap-2 text-xs/relaxed tabular-nums">
      {[
        ["Habitaciones", bill.subtotalCents],
        ["Descuentos aplicados", -bill.discountCents],
        ["Total de la cuenta", bill.totalCents],
        ["Pagos recibidos", compact ? bill.paidCents : -bill.paidCents],
      ]
        .filter(
          ([label, value]) =>
            !compact ||
            Number(value) !== 0 ||
            ["Total de la cuenta", "Pagos recibidos"].includes(String(label))
        )
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{formatMoney(Number(value) || 0)}</dd>
          </div>
        ))}
      <Separator />
      <div className="flex justify-between gap-4 text-sm font-semibold">
        <dt>
          {bill.balanceCents < 0
            ? "Saldo a favor"
            : bill.balanceCents > 0
              ? "Saldo pendiente"
              : "Cuenta saldada"}
        </dt>
        <dd>{formatMoney(Math.abs(bill.balanceCents))}</dd>
      </div>
      {bill.balanceCents < 0 && (
        <p className="text-muted-foreground">
          Este crédito sigue en la reserva. No se ha devuelto automáticamente.
        </p>
      )}
    </dl>
  )
}
