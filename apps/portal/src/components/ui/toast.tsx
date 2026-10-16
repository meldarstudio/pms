import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CircleAlertIcon, CircleCheckIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-60 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none">
        {toasts.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            toast={item}
            data-slot="toast"
            className={cn(
              "relative flex items-start gap-2.5 border bg-popover p-3 text-xs text-popover-foreground shadow-md transition-[opacity,transform] duration-100 outline-none data-ending-style:translate-y-2 data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-2 data-starting-style:opacity-0",
              item.type === "error" && "border-destructive/40",
            )}
          >
            {item.type === "error" ? (
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-booking-foreground" />
            )}
            <ToastPrimitive.Content className="min-w-0 flex-1">
              <ToastPrimitive.Title className="font-medium">{item.title}</ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="mt-1 text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
              {item.actionProps ? (
                <ToastPrimitive.Action
                  className="mt-2"
                  render={<Button variant="outline" size="xs" />}
                />
              ) : null}
            </ToastPrimitive.Content>
            <ToastPrimitive.Close
              aria-label="Cerrar notificación"
              render={<Button variant="ghost" size="icon-xs" />}
            >
              <XIcon />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toast} timeout={5000} limit={3}>
      {children}
      <ToastList />
    </ToastPrimitive.Provider>
  );
}
