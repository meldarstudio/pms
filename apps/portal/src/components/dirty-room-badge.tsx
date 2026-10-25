import { Badge } from "@/components/ui/badge";

/** Marks a room whose housekeeping status is dirty; clean rooms show nothing. */
export function DirtyRoomBadge() {
  return (
    <Badge
      variant="outline"
      size="sm"
      className="border-destructive/40 text-destructive"
      title="Habitación sucia"
    >
      Sucia
    </Badge>
  );
}
