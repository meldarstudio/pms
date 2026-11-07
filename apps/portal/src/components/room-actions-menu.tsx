import { EllipsisVerticalIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function RoomActionsMenu({
  index,
  size = "icon-sm",
  onRemove,
}: {
  index: number;
  size?: "icon" | "icon-sm";
  onRemove?: () => void;
}) {
  if (!onRemove) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size={size} />}
        aria-label={`Acciones de la habitación ${index + 1}`}
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2Icon />
          Quitar habitación
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
