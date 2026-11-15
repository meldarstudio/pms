import { address, email, legalName, phoneNumber, taxId } from "@/lib/constants";
import { formatPhoneNumber } from "@/lib/utils";
import type { LocalizedLegalDocument } from "./document";

const phone = formatPhoneNumber(phoneNumber);

export const reservationConditions: LocalizedLegalDocument = {
  es: {
    title: "Condiciones de reserva",
    description:
      "Tarifas, pagos, horarios, cambios, cancelaciones y devoluciones de Hotel Manantial en Churín.",
    effective: "Vigentes desde el 15 de noviembre de 2026.",
    intro:
      "Estas condiciones explican cómo funcionan las reservas en Hotel Manantial. Antes de pagar en línea verá el precio y las condiciones exactas de su estadía; lo que usted acepta en ese momento es lo que rige su reserva. Publicar una nueva versión de esta página no cambia una reserva ya aceptada.",
    sections: [
      {
        heading: "El hotel",
        paragraphs: [
          `${legalName}, RUC ${taxId}, ${address}. Reservas y consultas: WhatsApp ${phone} o ${email}.`,
        ],
      },
      {
        heading: "Precios y qué incluyen",
        items: [
          "Los precios son por habitación y por noche, en soles (PEN), con impuestos incluidos.",
          "Incluyen el alojamiento, Wi-Fi y cochera privada. El hotel no ofrece desayuno.",
          "Cada habitación tiene un máximo de adultos y de niños que se indica al reservar.",
          "Se admiten mascotas; avísenos al reservar.",
          "Una estadía puede tener hasta 60 noches.",
        ],
      },
      {
        heading: "Tarifas",
        items: [
          "Flexible: paga en línea la primera noche al reservar y el resto en el hotel. Puede cancelar sin cargo hasta dos días calendario antes de la llegada, inclusive, según la hora de Perú. Si cancela después de ese plazo o no se presenta, se cobra la primera noche.",
          "No reembolsable: tiene un precio menor y paga toda la estadía al reservar. Si cancela o no se presenta, se cobra el total de la estadía, sin otra penalidad, y no se devuelve lo pagado, salvo que el hotel no pueda prestar el servicio o haya un pago en exceso.",
        ],
      },
      {
        heading: "Pago y confirmación",
        items: [
          "En línea se paga con tarjeta, a través de Culqi.",
          "Antes de pagar verá el monto a pagar ahora, lo que queda por pagar en el hotel y las condiciones de cancelación. El precio se mantiene por unos minutos; si cambia, verá el nuevo antes de cualquier cobro.",
          "La reserva queda confirmada cuando el pago se confirma y la reserva se guarda. Verá la confirmación en pantalla y le enviaremos un correo.",
          "El saldo se paga al hacer el check-in, en efectivo, tarjeta, Yape o transferencia bancaria.",
          "Si reserva por WhatsApp o teléfono, el hotel le confirma por ese medio la tarifa, el monto y la forma de pago; esta página aplica a esas reservas en lo que corresponda.",
        ],
      },
      {
        heading: "Horarios",
        items: ["Check-in desde las 2:00 p. m.", "Check-out hasta las 11:00 a. m."],
      },
      {
        heading: "Cambios de fecha o de habitación",
        paragraphs: [
          "Los cambios se solicitan al hotel por WhatsApp o correo, indicando la referencia de su reserva. Dependen de la disponibilidad y las nuevas noches se cobran al precio vigente de la misma tarifa. Si el nuevo total es mayor, paga la diferencia; si es menor, la diferencia se trata como un saldo a su favor según su tarifa. En la tarifa No reembolsable, lo pagado se aplica a las nuevas fechas, pero no se devuelve.",
        ],
      },
      {
        heading: "Cancelación y no presentación",
        paragraphs: [
          "Para cancelar, escríbanos por WhatsApp o correo con la referencia de su reserva. El cargo depende de la tarifa aceptada y de la fecha en que cancela, como se indica arriba. Si no llega en la fecha de entrada y no nos avisa, se aplica el cargo por no presentación. Los cargos se descuentan de lo que ya pagó.",
        ],
      },
      {
        heading: "Devoluciones",
        items: [
          "Si queda un saldo a su favor, solicítelo por WhatsApp o correo con la referencia de su reserva.",
          "Lo devolvemos por el mismo medio de pago: a la misma tarjeta, si pagó con tarjeta, o por transferencia a la cuenta que usted indique, si pagó en efectivo, Yape o transferencia.",
          "Emitimos la devolución dentro de los 7 días hábiles siguientes a su aprobación. El tiempo que tarde su banco en reflejarla no depende del hotel.",
          "Solo con su acuerdo podemos convertir el saldo a su favor en un cupón para una estadía futura en lugar de devolver el dinero.",
        ],
      },
      {
        heading: "Si el hotel no puede prestar el servicio",
        paragraphs: [
          "Si el hotel no puede ofrecerle la habitación reservada o el servicio no corresponde a lo contratado, le ofreceremos una alternativa que usted puede aceptar o rechazar; si la rechaza, le devolvemos lo pagado por lo no prestado. Esto no limita los derechos que le reconoce el Código de Protección y Defensa del Consumidor.",
        ],
      },
      {
        heading: "Reclamos",
        paragraphs: [
          "Puede presentar un reclamo o una queja en el Libro de Reclamaciones de este sitio o en recepción.",
        ],
      },
    ],
  },
  en: {
    title: "Reservation conditions",
    description:
      "Rates, payments, times, changes, cancellations and refunds at Hotel Manantial in Churín.",
    effective: "Effective November 15, 2026.",
    intro:
      "These conditions explain how reservations work at Hotel Manantial. Before paying online you will see the exact price and conditions for your stay; what you accept at that moment governs your reservation. Publishing a new version of this page does not change a reservation already accepted.",
    sections: [
      {
        heading: "The hotel",
        paragraphs: [
          `${legalName}, RUC ${taxId}, ${address}. Bookings and questions: WhatsApp ${phone} or ${email}.`,
        ],
      },
      {
        heading: "Prices and what they include",
        items: [
          "Prices are per room per night, in Peruvian soles (PEN), taxes included.",
          "They include accommodation, Wi-Fi and private parking. The hotel does not provide breakfast.",
          "Each room has a maximum number of adults and of children, shown when you book.",
          "Pets are allowed; let us know when you book.",
          "A stay can be up to 60 nights.",
        ],
      },
      {
        heading: "Rates",
        items: [
          "Flexible: pay the first night online when you book and the rest at the hotel. You may cancel free of charge up to and including two calendar days before arrival, Peru time. If you cancel after that deadline or do not arrive, the first night is charged.",
          "Non-refundable: a lower price, with the full stay paid when you book. If you cancel or do not arrive, the full stay is charged, with no other penalty, and the amount paid is not returned, unless the hotel cannot provide the service or there is an overpayment.",
        ],
      },
      {
        heading: "Payment and confirmation",
        items: [
          "Online payment is by card, processed by Culqi.",
          "Before paying you will see the amount due now, what remains to pay at the hotel and the cancellation conditions. The price is held for a few minutes; if it changes, you will see the new one before any charge.",
          "The reservation is confirmed once the payment is confirmed and the reservation is saved. You will see the confirmation on screen and we will email it to you.",
          "The balance is paid at check-in by cash, card, Yape or bank transfer.",
          "If you book by WhatsApp or phone, the hotel confirms the rate, amount and payment method there; this page applies to those reservations where relevant.",
        ],
      },
      {
        heading: "Times",
        items: ["Check-in from 2:00 p.m.", "Check-out until 11:00 a.m."],
      },
      {
        heading: "Date or room changes",
        paragraphs: [
          "Ask the hotel for changes by WhatsApp or email, quoting your reservation reference. Changes depend on availability, and the new nights are charged at the current price of the same rate. If the new total is higher, you pay the difference; if it is lower, the difference is treated as a balance in your favor according to your rate. Under the Non-refundable rate, the amount paid is applied to the new dates but is not returned.",
        ],
      },
      {
        heading: "Cancellation and no-show",
        paragraphs: [
          "To cancel, message us by WhatsApp or email with your reservation reference. The charge depends on the rate you accepted and when you cancel, as described above. If you do not arrive on the check-in date and do not let us know, the no-show charge applies. Charges are deducted from what you have already paid.",
        ],
      },
      {
        heading: "Refunds",
        items: [
          "If there is a balance in your favor, request it by WhatsApp or email with your reservation reference.",
          "We refund it by the same payment method: to the same card if you paid by card, or by bank transfer to the account you name if you paid by cash, Yape or transfer.",
          "We issue the refund within 7 business days of approving it. The time your bank takes to show it is outside the hotel's control.",
          "Only with your agreement can we turn a balance in your favor into a coupon for a future stay instead of returning the money.",
        ],
      },
      {
        heading: "If the hotel cannot provide the service",
        paragraphs: [
          "If the hotel cannot provide the room you booked, or the service does not match what was agreed, we will offer you an alternative that you may accept or decline; if you decline, we refund what you paid for the part not provided. This does not limit your rights under Peru's Consumer Protection and Defense Code.",
        ],
      },
      {
        heading: "Complaints",
        paragraphs: [
          "You may file a complaint in the Libro de Reclamaciones (complaints book) on this site or at the front desk.",
        ],
      },
    ],
  },
};
