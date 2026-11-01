import type { ReservationCoupon } from "./api.ts";
import { longDate } from "./dates.ts";
import { formatMoney } from "./money.ts";
import { toast, toastError } from "./toast.ts";

type CouponFacts = Pick<ReservationCoupon, "code" | "balanceCents" | "expiresOn">;

export function couponMessage(coupon: CouponFacts, currency: string) {
  return `Tu cupón ${coupon.code} tiene un saldo disponible de ${formatMoney(coupon.balanceCents, currency)}. Puedes usarlo total o parcialmente en una próxima estadía con llegada hasta el ${longDate(coupon.expiresOn)}. No canjeable por dinero.`;
}

export async function copyCouponMessage(
  coupon: CouponFacts,
  currency: string,
  { announce = false } = {},
) {
  try {
    await navigator.clipboard.writeText(couponMessage(coupon, currency));
  } catch {
    toastError("No se pudo copiar el mensaje", `Comparte el código ${coupon.code} manualmente.`);
    return false;
  }
  if (announce) toast.add({ title: "Mensaje copiado", type: "success" });
  return true;
}
