import type { ReactNode } from "react";
import { cn } from "cn";
import { CircleAlertIcon, CircleCheckIcon, Undo2Icon, WalletIcon } from "lucide-react";
import type { ReservationDetail } from "@/lib/api";

const owing = {
  label: "Saldo pendiente",
  Icon: CircleAlertIcon,
  tone: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};
const owedBack = {
  label: "Por devolver",
  Icon: Undo2Icon,
  tone: "bg-credit text-credit-foreground",
};
const settled = {
  label: "Cuenta saldada",
  Icon: CircleCheckIcon,
  tone: "bg-booking text-booking-foreground",
};

export function balanceStatus(balanceCents: number) {
  if (balanceCents > 0) return owing;
  if (balanceCents < 0) return owedBack;
  return settled;
}

export function accountStatus(
  bill: Pick<ReservationDetail, "balanceCents" | "pendingRefundCents">,
) {
  if (bill.balanceCents > 0) return { state: "owing" as const, ...owing, cents: bill.balanceCents };
  const refundDueCents = -bill.balanceCents;
  const toReturnCents = Math.max(0, refundDueCents - bill.pendingRefundCents);
  if (toReturnCents > 0) return { state: "owed-back" as const, ...owedBack, cents: toReturnCents };
  if (refundDueCents > 0)
    return {
      state: "refund-requested" as const,
      label: "Reembolso solicitado",
      Icon: WalletIcon,
      tone: "bg-preview text-preview-foreground",
      cents: refundDueCents,
    };
  return { state: "settled" as const, ...settled, cents: 0 };
}

export function BalanceLabel({ balanceCents }: { balanceCents: number }) {
  const { label, Icon } = balanceStatus(balanceCents);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 shrink-0" />
      {label}
    </span>
  );
}

export function AccountStatusBanner({
  status,
  amount,
}: {
  status: ReturnType<typeof accountStatus>;
  amount: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-2 px-2.5 py-2", status.tone)}
    >
      <p className="flex items-center gap-2 font-medium">
        <status.Icon aria-hidden className="size-4 shrink-0" />
        {status.label}
      </p>
      <p className="ml-auto font-semibold tabular-nums">{amount}</p>
    </div>
  );
}

export function SummaryRow({
  label,
  value,
  note,
  className,
}: {
  label: ReactNode;
  value: string;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap justify-between gap-x-2", className)}>
      <dt>{label}</dt>
      <dd className="ml-auto tabular-nums">{value}</dd>
      {note && <dd className="w-full text-muted-foreground">{note}</dd>}
    </div>
  );
}
