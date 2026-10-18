import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PwaStatus({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [reconnected, setReconnected] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const wentOnline = () => {
      setOnline(true);
      setReconnected(true);
    };
    const wentOffline = () => {
      setOnline(false);
      setReconnected(false);
    };
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
      {(!online || reconnected || waitingWorker) && (
        <aside
          role="status"
          className={`fixed inset-x-0 z-[100] flex items-center justify-center gap-3 bg-foreground px-4 py-2 text-sm text-background ${online ? "top-0" : "inset-y-0 flex-col"}`}
        >
          {!online ? (
            <>
              <span>Sin conexión a internet. Las operaciones requieren conexión.</span>
              <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                Reintentar
              </Button>
            </>
          ) : waitingWorker ? (
            <>
              <span>Nueva versión disponible</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  waitingWorker?.postMessage("ACTIVATE_UPDATE");
                }}
              >
                Actualizar
              </Button>
            </>
          ) : (
            <>
              <span>Conexión restablecida.</span>
              <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                Reintentar
              </Button>
            </>
          )}
        </aside>
      )}
    </>
  );
}
