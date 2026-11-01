import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { parseISO } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export type NightlyPriceRoom = {
  key: string;
  typeName: string;
  nights: { date: string; priceCents: number }[];
};

export function NightlyPriceDetail({
  rooms,
  currency,
}: {
  rooms: NightlyPriceRoom[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  if (
    rooms.length <= 1 &&
    !rooms.some((room) =>
      room.nights.some((night) => night.priceCents !== room.nights[0]?.priceCents),
    )
  )
    return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger className="group/detail flex h-8 w-full items-center justify-between gap-2 rounded-none border border-input bg-transparent px-2.5 text-left text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30">
        Ver detalle
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 transition-transform group-data-[panel-open]/detail:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3">
        {rooms.map((room, index) => (
          <section
            key={room.key}
            aria-label={`Habitación ${index + 1}: ${room.typeName}`}
            className="flex flex-col gap-1"
          >
            <h4 className="font-medium">
              Habitación {index + 1} · {room.typeName}
            </h4>
            <dl className="flex flex-col gap-1">
              {room.nights.map((night) => (
                <div key={night.date} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {format(parseISO(night.date), "EEE d MMM")}
                  </dt>
                  <dd className="tabular-nums">{formatMoney(night.priceCents, currency)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
