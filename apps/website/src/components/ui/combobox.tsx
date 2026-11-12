import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { cn } from "cn";

const Combobox = ComboboxPrimitive.Root;

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger data-slot="combobox-trigger" className={className} {...props}>
      {children}
      <CaretDownIcon aria-hidden="true" className="pointer-events-none size-4 shrink-0" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "group/combobox-content relative max-h-(--available-height) max-w-(--available-width) origin-(--transform-origin) overflow-hidden border border-stone-300 bg-white text-stone-900 shadow-lg duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "block min-h-12 w-full border-0 border-b border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-600",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-[min(18rem,calc(var(--available-height)-3.5rem))] scroll-py-1 overflow-y-auto overscroll-contain data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex min-h-11 w-full cursor-default items-center gap-3 py-2 pr-9 pl-3 text-base outline-hidden select-none data-highlighted:bg-stone-100",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-3 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon aria-hidden="true" className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center px-3 py-3 text-center text-base text-stone-700 group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
};
