import { useSyncExternalStore } from "react";
import type { Lang } from "@/i18n/utils";
import type { CardPayments } from "@/lib/reservation/checkout-runner";

const subscribe = () => () => {};
const readMode = () =>
  import.meta.env.DEV ? (new URLSearchParams(window.location.search).get("payments") ?? "") : "";
const unreadMode = () => (import.meta.env.DEV ? null : "");

export function usePaymentsPreview(
  payments: CardPayments | null,
  devPayments: CardPayments | null,
) {
  const mode = useSyncExternalStore(subscribe, readMode, unreadMode);
  const chosen = mode === "on" ? devPayments : mode === "off" ? null : payments;
  return { payments: chosen, known: mode !== null };
}

export function PaymentsToggle({ lang, on }: { lang: Lang; on: boolean }) {
  const url = new URL(window.location.href);
  url.searchParams.set("payments", on ? "off" : "on");
  return (
    <a
      href={url.href}
      className="font-source-sans-3 fixed bottom-4 left-4 z-90 inline-flex min-h-11 items-center bg-stone-900 px-4 text-sm font-medium text-white shadow-lg hover:bg-stone-700"
    >
      {`Dev · ${lang === "en" ? "Online payments" : "Pagos en línea"}: ${on ? "ON" : "OFF"} ⇄`}
    </a>
  );
}
