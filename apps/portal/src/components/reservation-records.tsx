import { Fragment } from "react";
import { CreditCardIcon, EllipsisIcon, UserRoundIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
import { isValid, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { paymentMethods } from "@/components/reservation-entry-forms";
import type { ReservationDetail, ReservationPayment, StayingGuest } from "@/lib/api";
import { format } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

// Staying-guest and payment lists shared by the compact dialog and the full page.
// Callers own what Editar and Eliminar do. `framed` draws the lists in a border
// with an icon per guest and a visually hidden heading, and gives empty states an
// icon, for the page's record cards.

export function StayingGuestList({
  detail,
  disabled,
  onEdit,
  onDelete,
  framed = false,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  onEdit: (guest: StayingGuest) => void;
  onDelete: (guest: StayingGuest) => void;
  framed?: boolean;
}) {
  if (!detail.stayingGuests.length)
    return (
      <Empty>
        <EmptyHeader>
          {framed && (
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
          )}
          <EmptyTitle>Sin huéspedes registrados</EmptyTitle>
          <EmptyDescription>
            Agrega a las personas que se alojan. Pueden ser distintas del contacto principal.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const roomLabel = (id: string | null) =>
    detail.rooms.find((room) => room.id === id)?.roomNumber ?? "Sin indicar";
  const guestLine = (guest: StayingGuest) =>
    [
      guest.reservationRoomId
        ? `Hab. ${roomLabel(guest.reservationRoomId)}`
        : "Sin habitación indicada",
      [guest.documentType, guest.documentNumber].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(" · ");
  const actions = (guest: StayingGuest) => (
    <RowActions
      label={`Acciones de ${guest.fullName}`}
      disabled={disabled}
      onEdit={() => onEdit(guest)}
      onDelete={() => onDelete(guest)}
    />
  );
  if (framed)
    return (
      <section className="flex flex-col">
        <h3 className="sr-only">Huéspedes registrados</h3>
        <ItemGroup aria-label="Huéspedes registrados" className="gap-0 border">
          {detail.stayingGuests.map((guest, index) => (
            <Fragment key={guest.id}>
              {index > 0 && <ItemSeparator className="my-0" />}
              <Item role="listitem">
                <ItemMedia variant="icon">
                  <UserRoundIcon aria-hidden="true" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="wrap-anywhere">{guest.fullName}</ItemTitle>
                  <ItemDescription className="wrap-anywhere">{guestLine(guest)}</ItemDescription>
                </ItemContent>
                <ItemActions>{actions(guest)}</ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      </section>
    );
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">Huéspedes registrados</h3>
      <ul aria-label="Huéspedes registrados" className="flex flex-col">
        {detail.stayingGuests.map((guest, index) => (
          <li key={guest.id}>
            {index > 0 && <Separator />}
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium wrap-anywhere">{guest.fullName}</p>
                <p className="text-xs wrap-anywhere text-muted-foreground">{guestLine(guest)}</p>
              </div>
              {actions(guest)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PaymentList({
  detail,
  disabled,
  onEdit,
  onDelete,
  hideReferenceOnPhones = false,
  framed = false,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  onEdit: (entry: ReservationPayment) => void;
  onDelete: (entry: ReservationPayment) => void;
  hideReferenceOnPhones?: boolean;
  framed?: boolean;
}) {
  const entries = detail.payments;
  if (!entries.length)
    return (
      <Empty>
        <EmptyHeader>
          {framed && (
            <EmptyMedia variant="icon">
              <CreditCardIcon />
            </EmptyMedia>
          )}
          <EmptyTitle>Sin pagos registrados</EmptyTitle>
          <EmptyDescription>Los pagos registrados aparecerán aquí.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const reference = cn(hideReferenceOnPhones && "max-md:hidden");
  return (
    <section className={cn("flex flex-col", framed ? "border" : "gap-3")}>
      <h3 className={framed ? "sr-only" : "font-medium"}>Pagos registrados</h3>
      <Table aria-label="Pagos registrados">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Método</TableHead>
            <TableHead className={reference}>Referencia</TableHead>
            <TableHead className="text-right">Importe</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...entries]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((e) => (
              <TableRow key={e.id}>
                <TableCell>{paymentDate(e.paymentDate)}</TableCell>
                <TableCell>
                  {paymentMethods.find((method) => method.value === e.method)?.label ??
                    e.method ??
                    "—"}
                </TableCell>
                <TableCell className={cn("max-w-40 break-words whitespace-normal", reference)}>
                  {e.reference?.toUpperCase() || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(e.amountCents, detail.currency)}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    label={`Acciones del pago de ${formatMoney(e.amountCents, detail.currency)} del ${e.paymentDate}`}
                    disabled={disabled}
                    onEdit={() => onEdit(e)}
                    onDelete={() => onDelete(e)}
                  />
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </section>
  );
}

function paymentDate(value: string) {
  const date = parseISO(value);
  return isValid(date) ? format(date, "d MMM yyyy") : "—";
}

function RowActions({
  label,
  disabled,
  onEdit,
  onDelete,
}: {
  label: string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label={label}
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
