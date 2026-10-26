import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Replaces the shell header's section title, e.g. with a breadcrumb. The shell
// shows its navigation label while nothing is rendered here.
export const PageTitleContext = createContext<HTMLDivElement | null>(null);

export function PageTitle({ children }: { children: ReactNode }) {
  const container = useContext(PageTitleContext);
  return container ? createPortal(children, container) : null;
}
