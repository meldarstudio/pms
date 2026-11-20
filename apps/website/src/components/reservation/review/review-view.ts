import type { Lang } from "@/i18n/utils";
import type { CheckoutView } from "@/lib/reservation/checkout";
import type { CardPayments } from "@/lib/reservation/checkout-runner";
import type { GuestPayment } from "@/lib/reservation/payment";
import type { ReviewText } from "./text";

export type ReviewRoom = {
  name: string;
  beds: string;
  pmsRoomTypeId: string | null;
  photo: { src: string; alt: string };
};

export type ReviewProps = {
  lang: Lang;
  apiBase: string;
  payments: CardPayments | null;
  devPayments: CardPayments | null;
  chooseHref: string;
  summaryHref: string;
  whatsappHref: string;
  privacyHref: string;
  conditionsHref: string;
  text: ReviewText;
  rooms: Record<string, ReviewRoom>;
};

export type SavedConfirmation = {
  view: CheckoutView;
  room: ReviewRoom;
  reservation: NonNullable<GuestPayment["reservation"]>;
  currency: string;
};
