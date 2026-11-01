import { accountStatus } from "@/components/balance-status";
import type { ReservationDetail, WorkflowBilling } from "@/lib/api";
import { longDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export function OutcomeAccountPreview({
  billing,
  detail,
  today,
}: {
  billing: WorkflowBilling;
  detail: ReservationDetail;
  today: string;
}) {
  const status = accountStatus(billing);
  const returns = billing.couponMovements.filter(
    (movement) =>
      movement.kind === "return" &&
      movement.amountCents > 0 &&
      !detail.couponMovements.some((saved) => saved.id === movement.id),
  );
  return (
    <>
      <p>
        {status.label} {formatMoney(status.cents, detail.currency)}
      </p>
      {returns.map((movement) => (
        <p key={movement.id}>
          {`${formatMoney(movement.amountCents, detail.currency)} vuelven al cupón ${movement.code}${
            movement.expiresOn < today
              ? ", ya vencido. No se podrá usar."
              : ` · Vence el ${longDate(movement.expiresOn)}`
          }`}
        </p>
      ))}
    </>
  );
}
