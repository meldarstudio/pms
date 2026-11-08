import type { ReactNode } from "react";
import { parseISO } from "date-fns";
import { SummaryRow, accountStatus } from "@/components/balance-status";
import { HotelLogo } from "@/components/hotel-logo";
import {
  PrintSheet,
  longPropertyDate,
  propertyTime,
  useStampedAtPrint,
} from "@/components/print-sheet";
import { isReleased } from "@/components/reservation-account";
import { paymentMethods } from "@/components/reservation-entry-forms";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReservationDetail } from "@/lib/api";
import { format, nightsBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { phoneDisplay } from "@/lib/phone";
import { propertyToday } from "@/lib/property-calendar";
import { ratePlanLabels } from "@/lib/rate-plans";
import { occupantsLabel, reservationStatusLabel } from "@/lib/reservation-list";

const nightsLabel = (count: number) => `${count} ${count === 1 ? "noche" : "noches"}`;
const shortDate = (day: string) => format(parseISO(day), "d MMM yyyy");
const methodLabel = (method: string) =>
  paymentMethods.find((entry) => entry.value === method)?.label ?? method;

type Line = {
  key: string;
  at: string;
  date: string;
  label: string;
  method: string;
  amount: string;
};

function movementLines(detail: ReservationDetail): Line[] {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const lines: Line[] = detail.payments.map((payment) => ({
    key: payment.id,
    at: payment.createdAt,
    date: payment.paymentDate,
    label: payment.culqiChargeId ? "Pago en línea" : "Pago",
    method: payment.culqiChargeId ? "Tarjeta" : methodLabel(payment.method),
    amount: money(payment.amountCents),
  }));
  for (const refund of detail.refunds) {
    if (refund.status === "failed") continue;
    lines.push({
      key: refund.id,
      at: refund.requestedAt,
      date: refund.refundDate ?? propertyToday(new Date(refund.requestedAt)),
      label: refund.status === "requested" ? "Reembolso (solicitado)" : "Reembolso",
      method: methodLabel(refund.method),
      amount:
        refund.status === "requested"
          ? `(${money(refund.amountCents)})`
          : money(-refund.amountCents),
    });
  }
  for (const movement of detail.couponMovements)
    lines.push({
      key: movement.id,
      at: movement.recordedAt,
      date: movement.recordedOn,
      label: { issue: "Cupón emitido", redeem: "Cupón aplicado", return: "Devuelto al cupón" }[
        movement.kind
      ],
      method: "Cupón",
      amount: money(movement.kind === "redeem" ? movement.amountCents : -movement.amountCents),
    });
  return lines.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex break-inside-avoid flex-col gap-2">
      <h2 className="text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Bill({ detail }: { detail: ReservationDetail }) {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const minus = (cents: number) => money(cents ? -cents : 0);
  const cancellation = detail.cancellation;
  const status = accountStatus(detail);
  return (
    <dl aria-label="Cuenta" className="ml-auto flex w-72 flex-col gap-1.5 text-sm">
      {isReleased(detail.status) ? (
        <>
          <SummaryRow
            label={
              (cancellation?.outcome ?? detail.status) === "no_show"
                ? "Cargo por no presentarse"
                : "Cargo por cancelación"
            }
            value={money(cancellation?.policyChargeCents ?? detail.totalCents)}
          />
          {cancellation?.waivers.map((waiver) => (
            <SummaryRow key={waiver.id} label="Cargo perdonado" value={minus(waiver.amountCents)} />
          ))}
        </>
      ) : (
        <>
          <SummaryRow label="Subtotal" value={money(detail.subtotalCents)} />
          {detail.discountCents > 0 && (
            <SummaryRow label="Descuento" value={minus(detail.discountCents)} />
          )}
        </>
      )}
      <SummaryRow className="font-medium" label="Total" value={money(detail.totalCents)} />
      <SummaryRow label="Pagado" value={money(detail.paidCents)} />
      {detail.couponAppliedCents > 0 && (
        <SummaryRow label="Pagado con cupón" value={money(detail.couponAppliedCents)} />
      )}
      {detail.refundedCents > 0 && (
        <SummaryRow label="Reembolsado" value={minus(detail.refundedCents)} />
      )}
      {detail.couponIssuedCents > 0 && (
        <SummaryRow label="Pasado a cupón" value={minus(detail.couponIssuedCents)} />
      )}
      <SummaryRow
        className="mt-1 border-t pt-2 text-base font-semibold"
        label={status.label}
        value={money(status.cents)}
      />
    </dl>
  );
}

export function ReservationSummarySheet({ detail }: { detail: ReservationDetail }) {
  const printedAt = useStampedAtPrint();
  const { phone, email } = detail.guest;
  const movements = movementLines(detail);
  const today = propertyToday(printedAt);
  return (
    <PrintSheet>
      <div className="flex flex-col gap-6 text-sm">
        <header className="flex items-start justify-between gap-6 border-b pb-4">
          <HotelLogo className="h-10 w-40" />
          <div className="flex flex-col items-end gap-0.5 text-right">
            <h1 className="text-xl font-semibold">Resumen de reserva</h1>
            <p className="font-mono text-xs tracking-widest uppercase">
              #{detail.code} · {reservationStatusLabel(detail.status)}
            </p>
            <p className="text-xs text-muted-foreground">
              Impreso{" "}
              <span className="inline-block first-letter:uppercase">{longPropertyDate(today)}</span>
              {" · "}
              {propertyTime(printedAt)}
            </p>
          </div>
        </header>
        <Block title="Contacto principal">
          <p className="text-lg font-semibold">{detail.guest.fullName}</p>
          {(phone || email) && (
            <p>{[phone && phoneDisplay(phone).text, email].filter(Boolean).join(" · ")}</p>
          )}
        </Block>
        {detail.stayingGuests.length > 0 && (
          <Block title="Huéspedes">
            <ul className="flex flex-col gap-0.5">
              {detail.stayingGuests.map((guest) => (
                <li key={guest.id}>{guest.fullName}</li>
              ))}
            </ul>
          </Block>
        )}
        <Block title="Estadía">
          <dl className="grid grid-cols-4 gap-4">
            <Fact label="Ingreso">
              <span className="capitalize">
                {format(parseISO(detail.checkIn), "EEE d MMM yyyy")}
              </span>
            </Fact>
            <Fact label="Egreso">
              <span className="capitalize">
                {format(parseISO(detail.checkOut), "EEE d MMM yyyy")}
              </span>
            </Fact>
            <Fact label="Noches">
              {nightsLabel(nightsBetween(detail.checkIn, detail.checkOut))}
            </Fact>
            <Fact label="Tarifa">{ratePlanLabels[detail.ratePlan.plan]}</Fact>
          </dl>
          <Table aria-label="Habitaciones" className="border">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Tipo</TableHead>
                <TableHead scope="col">Habitación</TableHead>
                <TableHead scope="col">Ocupantes</TableHead>
                <TableHead scope="col" className="text-right">
                  Importe
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.rooms.map((room) => (
                <TableRow key={room.id} className="break-inside-avoid">
                  <TableCell>{room.roomTypeName || "Habitación"}</TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {room.roomNumber ?? "Por asignar"}
                  </TableCell>
                  <TableCell>{occupantsLabel([room])}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(room.totalCents, detail.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Block>
        <Block title="Cuenta">
          <Bill detail={detail} />
        </Block>
        {movements.length > 0 && (
          <Block title="Movimientos">
            <Table aria-label="Movimientos" className="border">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Fecha</TableHead>
                  <TableHead scope="col">Movimiento</TableHead>
                  <TableHead scope="col">Método</TableHead>
                  <TableHead scope="col" className="text-right">
                    Importe
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((line) => (
                  <TableRow key={line.key} className="break-inside-avoid">
                    <TableCell>{shortDate(line.date)}</TableCell>
                    <TableCell>{line.label}</TableCell>
                    <TableCell>{line.method}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Block>
        )}
        <footer className="border-t pt-3 text-center text-xs text-muted-foreground">
          Documento informativo, no es comprobante de pago.
        </footer>
      </div>
    </PrintSheet>
  );
}
