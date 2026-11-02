import { useRef, type Ref } from "react";
import { EllipsisVerticalIcon, TagIcon, Trash2Icon } from "lucide-react";
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
  triggerRef,
  onReprice,
  onRemove,
}: {
  index: number;
  size?: "icon" | "icon-sm";
  triggerRef?: Ref<HTMLButtonElement>;
  onReprice?: () => void;
  onRemove?: () => void;
}) {
  const handsFocusOff = useRef(false);
  if (!onReprice && !onRemove) return null;
  return (
    <DropdownMenu onOpenChange={(open) => open && (handsFocusOff.current = false)}>
      <DropdownMenuTrigger
        ref={triggerRef}
        render={<Button type="button" variant="ghost" size={size} />}
        aria-label={`Acciones de la habitación ${index + 1}`}
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-48"
        finalFocus={() => !handsFocusOff.current}
      >
        {onReprice && (
          <DropdownMenuItem
            onClick={() => {
              handsFocusOff.current = true;
              onReprice();
            }}
          >
            <TagIcon />
            Cambiar precio por noche
          </DropdownMenuItem>
        )}
        {onRemove && (
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2Icon />
            Quitar habitación
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
