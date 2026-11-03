import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CircleAlertIcon, CircleCheckIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  const isMobile = useIsMobile();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+1rem)] z-60 mx-auto flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none md:inset-x-auto md:top-auto md:right-4 md:bottom-4">
        {toasts.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            toast={item}
            swipeDirection={isMobile ? ["up", "left", "right"] : ["down", "right"]}
            data-slot="toast"
            className={cn(
              "relative flex items-start gap-2.5 border bg-popover p-3 text-xs text-popover-foreground shadow-md transition-[opacity,transform] duration-100 outline-none data-ending-style:-translate-y-2 data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-2 data-starting-style:opacity-0 md:data-ending-style:translate-y-2 data-swipe-direction:duration-200 data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))] data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
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
