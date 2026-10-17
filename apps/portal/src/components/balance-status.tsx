import { CircleAlertIcon, CircleCheckIcon, WalletIcon } from "lucide-react";

export function balanceStatus(balanceCents: number) {
  if (balanceCents > 0) {
    return {
      label: "Saldo pendiente",
      Icon: CircleAlertIcon,
      tone: "bg-destructive/10 text-destructive dark:bg-destructive/20",
    };
  }
  if (balanceCents < 0) {
    return {
      label: "Saldo a favor",
      Icon: WalletIcon,
      tone: "bg-credit text-credit-foreground",
    };
  }
  return {
    label: "Cuenta saldada",
    Icon: CircleCheckIcon,
    tone: "bg-muted text-muted-foreground",
  };
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
