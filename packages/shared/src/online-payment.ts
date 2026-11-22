export type OnlinePaymentMethod = "card" | "yape";

export const ONLINE_PAYMENT_SOURCE = /^(tkn|ype)_[\w-]{1,200}$/;

export const YAPE_MAX_CENTS = 200_000;

export const onlinePaymentMethod = (sourceId: string): OnlinePaymentMethod =>
  sourceId.startsWith("ype_") ? "yape" : "card";

export const yapeAllowed = (amountCents: number) => amountCents <= YAPE_MAX_CENTS;
