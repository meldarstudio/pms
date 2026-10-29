import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const PageTitleContext = createContext<HTMLDivElement | null>(null);

export function PageTitle({ children }: { children: ReactNode }) {
  const container = useContext(PageTitleContext);
  return container ? createPortal(children, container) : null;
}
