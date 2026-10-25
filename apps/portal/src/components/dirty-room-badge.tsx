import { Badge } from "@/components/ui/badge";

/** Marks a room whose housekeeping status is dirty; clean rooms show nothing. */
export function DirtyRoomBadge() {
  return (
    <Badge
      variant="outline"
      className="h-4 border-destructive/40 px-1 text-[0.625rem] text-destructive"
      title="Habitación sucia"
    >
      Sucia
    </Badge>
  );
}
