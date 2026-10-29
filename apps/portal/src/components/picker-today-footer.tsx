import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function PickerTodayFooter({
  disabled,
  onToday,
}: {
  disabled?: boolean;
  onToday: () => void;
}) {
  return (
    <>
      <Separator />
      <div className="flex p-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={disabled}
          onClick={onToday}
        >
          Hoy
        </Button>
      </div>
    </>
  );
}
