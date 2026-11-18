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
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { StayingGuest } from "@/lib/api";
import { phoneDisplay } from "@/lib/phone";

export function NoStayingGuests({
  framed = false,
  className,
}: {
  framed?: boolean;
  className?: string;
}) {
  return (
    <Empty className={cn(framed && "border", className)}>
      <EmptyHeader>
        {framed && (
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
        )}
        <EmptyTitle>Sin huéspedes registrados</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

export function GuestLine({ guest, className }: { guest: StayingGuest; className?: string }) {
  const parts = [
    [guest.documentType, guest.documentNumber].filter(Boolean).join(" "),
    guest.phone ? phoneDisplay(guest.phone).text : "",
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className={cn("truncate text-xs text-muted-foreground", className)}>{parts.join(" · ")}</p>
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
