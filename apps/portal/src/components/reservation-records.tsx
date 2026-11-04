import { EllipsisIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
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
import { Separator } from "@/components/ui/separator";
import type { ReservationDetail, StayingGuest } from "@/lib/api";
import { phoneDisplay } from "@/lib/phone";

export function NoStayingGuests({ framed = false }: { framed?: boolean }) {
  return (
    <Empty className={cn(framed && "border")}>
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
}

export function StayingGuestList({
  detail,
  disabled,
  onEdit,
  onDelete,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  onEdit: (guest: StayingGuest) => void;
  onDelete: (guest: StayingGuest) => void;
}) {
  if (!detail.stayingGuests.length) return <NoStayingGuests />;
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
                <GuestLine guest={guest} />
              </div>
              <RowActions
                label={`Acciones de ${guest.fullName}`}
                disabled={disabled}
                onEdit={() => onEdit(guest)}
                onDelete={() => onDelete(guest)}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuestLine({ guest, className }: { guest: StayingGuest; className?: string }) {
  const parts = [
    [guest.documentType, guest.documentNumber].filter(Boolean).join(" "),
    guest.phone ? phoneDisplay(guest.phone).text : "",
  ].filter(Boolean);
  if (!parts.length && !guest.email) return null;
  return (
    <p className={cn("truncate text-xs text-muted-foreground", className)}>
      {parts.join(" · ")}
      {guest.email && (
        <span className="max-md:hidden">
          {parts.length ? " · " : ""}
          {guest.email}
        </span>
      )}
    </p>
  );
}

export function RowActions({
  label,
  disabled,
  onEdit,
  onDelete,
  editLabel = "Editar",
  deleteLabel = "Eliminar",
}: {
  label: string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
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
          <DropdownMenuItem onClick={onEdit}>{editLabel}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            {deleteLabel}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
