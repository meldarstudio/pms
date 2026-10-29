import { Badge } from "@/components/ui/badge";

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
