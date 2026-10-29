import type { RefObject } from "react";
import { PlusIcon } from "lucide-react";
import { PagePrimaryAction } from "@/components/page-primary-action";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

export function NewReservationButton({
  onClick,
  disabled,
  scrollRef,
}: {
  onClick: () => void;
  disabled?: boolean;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const mobile = useIsMobile();
  if (mobile)
    return (
      <PagePrimaryAction
        icon={<PlusIcon data-icon="inline-start" />}
        label="Nueva reserva"
        scrollRef={scrollRef}
        disabled={disabled}
        onClick={onClick}
      />
    );
  return (
    <Button disabled={disabled} onClick={onClick}>
      <PlusIcon data-icon="inline-start" />
      Nueva reserva
    </Button>
  );
}
