import { AccountStatusBanner, accountStatus } from "@/components/balance-status";
import type { ReservationDetail, WorkflowBilling } from "@/lib/api";
import { longDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type Props = { billing: WorkflowBilling; detail: ReservationDetail; today: string };

export function OutcomeAccountPreview(props: Props) {
  const status = accountStatus(props.billing);
  return (
    <>
      <AccountStatusBanner
        status={status}
        amount={formatMoney(status.cents, props.detail.currency)}
      />
      <CouponReturns {...props} />
    </>
  );
}

export function CouponReturns({ billing, detail, today }: Props) {
  return billing.couponMovements
    .filter(
      (movement) =>
        movement.kind === "return" &&
        movement.amountCents > 0 &&
        !detail.couponMovements.some((saved) => saved.id === movement.id),
    )
    .map((movement) => (
      <p key={movement.id} className="text-muted-foreground">
        {`${formatMoney(movement.amountCents, detail.currency)} vuelven al cupón ${movement.code}${
          movement.expiresOn < today
            ? ", ya vencido. No se podrá usar."
            : ` · Vence el ${longDate(movement.expiresOn)}`
        }`}
      </p>
    ));
}
