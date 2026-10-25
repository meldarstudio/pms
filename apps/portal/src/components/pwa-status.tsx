import { useEffect, useState, type ReactNode } from "react";
import { RefreshCwIcon, WifiOffIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const DISMISSED_UPDATE_KEY = "manantial-dismissed-update";
// Above the floating page action and clear of the header, whose sidebar toggle stays reachable.
const floatingNotice =
  "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[100] shadow-xl sm:left-auto sm:w-80";

export function PwaStatus({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISSED_UPDATE_KEY);
    } catch {
      return null;
    }
  });
  const showUpdate = online && waitingWorker && dismissedUpdate !== waitingWorker.scriptURL;

  function dismissUpdate() {
    if (!waitingWorker) return;
    setDismissedUpdate(waitingWorker.scriptURL);
    try {
      window.sessionStorage.setItem(DISMISSED_UPDATE_KEY, waitingWorker.scriptURL);
    } catch {
      // Storage may be blocked; the notice still stays dismissed until this page closes.
    }
  }

  useEffect(() => {
    const wentOnline = () => setOnline(true);
    const wentOffline = () => setOnline(false);
    const updateActivated = (event: MessageEvent) => {
      if (event.data === "UPDATE_ACTIVATED") window.location.reload();
    };
    window.addEventListener("online", wentOnline);
    window.addEventListener("offline", wentOffline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", updateActivated);
    }

    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register(`/sw.js?build=${import.meta.env.VITE_PWA_BUILD_ID}`)
        .then((registration) => {
          if (registration.waiting) setWaitingWorker(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            installing?.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                setWaitingWorker(registration.waiting);
              }
            });
          });
        });
    }

    return () => {
      window.removeEventListener("online", wentOnline);
      window.removeEventListener("offline", wentOffline);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", updateActivated);
      }
    };
  }, []);

  return (
    <>
      <div className={online ? "contents" : undefined} hidden={!online}>
        {children}
      </div>
      {!online && (
        <div role="status" className="fixed inset-0 z-[100] flex bg-background p-6">
          <Empty className="m-auto max-w-md border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WifiOffIcon />
              </EmptyMedia>
              <EmptyTitle>Sin conexión a internet</EmptyTitle>
              <EmptyDescription>Las operaciones requieren conexión.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}
      {showUpdate && (
        <Card
          role="status"
          aria-label="Actualización disponible"
          size="sm"
          className={floatingNotice}
        >
          <CardHeader>
            <CardTitle>Nueva versión disponible</CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar aviso"
                onClick={dismissUpdate}
              >
                <XIcon />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            Guarda tus cambios antes de continuar. Solo se recargará esta ventana.
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <Button onClick={() => waitingWorker?.postMessage("ACTIVATE_UPDATE")}>
              <RefreshCwIcon data-icon="inline-start" />
              Actualizar ahora
            </Button>
            <Button variant="ghost" size="sm" onClick={dismissUpdate}>
              Ahora no
            </Button>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
