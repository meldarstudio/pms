import { useState } from "react";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
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

export function useResponsivePanel<T>(subject: T | null, { tabletDrawer = false } = {}) {
  const narrow = useIsMobile();
  const tablet = useIsTablet();
  const mobile = narrow || (tabletDrawer && tablet);
  const [opening, setOpening] = useState({ subject, mobile });
  if (opening.subject !== subject)
    setOpening({ subject, mobile: subject === null ? opening.mobile : mobile });
  const asDrawer = opening.mobile;
  return { asDrawer, surface: asDrawer ? surfaces.drawer : surfaces.sheet };
}
