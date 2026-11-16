import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const surfaces = {
  sheet: {
    Root: Sheet,
    Content: SheetContent,
    Header: SheetHeader,
    Title: SheetTitle,
    Description: SheetDescription,
    Footer: SheetFooter,
    Close: SheetClose,
  },
  drawer: {
    Root: Drawer,
    Content: DrawerContent,
    Header: DrawerHeader,
    Title: DrawerTitle,
    Description: DrawerDescription,
    Footer: DrawerFooter,
    Close: DrawerClose,
  },
};
export type PanelSurface = (typeof surfaces)[keyof typeof surfaces];

export function useResponsivePanel<T>(subject: T | null) {
  const mobile = useIsMobile();
  const [opening, setOpening] = useState({ subject, mobile });
  if (opening.subject !== subject)
    setOpening({ subject, mobile: subject === null ? opening.mobile : mobile });
  const asDrawer = opening.mobile;
  return { asDrawer, surface: asDrawer ? surfaces.drawer : surfaces.sheet };
}
