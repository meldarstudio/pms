import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const PageHeaderActionsContext = createContext<HTMLDivElement | null>(null);

export function PageHeaderActions({ children }: { children: ReactNode }) {
  const container = useContext(PageHeaderActionsContext);
  return container ? createPortal(children, container) : null;
}
