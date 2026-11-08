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
const RUNNING_BUILD_ID = import.meta.env.VITE_PWA_BUILD_ID;
const floatingNotice =
  "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-[100] shadow-xl sm:left-auto sm:w-80";

async function fetchDeployedBuildId() {
  const response = await fetch("/", { cache: "no-store" });
  if (!response.ok) return null;
  const html = await response.text();
  return (
    new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector<HTMLMetaElement>('meta[name="pwa-build-id"]')?.content ?? null
  );
}

export function PwaStatus({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [newerBuildId, setNewerBuildId] = useState<string | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISSED_UPDATE_KEY);
    } catch {
      return null;
    }
  });
  const showUpdate = online && newerBuildId && dismissedUpdate !== newerBuildId;

  function dismissUpdate() {
    if (!newerBuildId) return;
    setDismissedUpdate(newerBuildId);
    try {
      window.sessionStorage.setItem(DISMISSED_UPDATE_KEY, newerBuildId);
    } catch {}
  }

  useEffect(() => {
    const wentOnline = () => setOnline(true);
    const wentOffline = () => setOnline(false);
    window.addEventListener("online", wentOnline);
    window.addEventListener("offline", wentOffline);
    return () => {
      window.removeEventListener("online", wentOnline);
      window.removeEventListener("offline", wentOffline);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`/sw.js?build=${RUNNING_BUILD_ID}`);
    }

    const checkForNewerDeployment = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      fetchDeployedBuildId().then(
        (deployedBuildId) => {
          if (deployedBuildId && deployedBuildId !== RUNNING_BUILD_ID) {
            setNewerBuildId(deployedBuildId);
          }
        },
        () => {},
      );
    };
    document.addEventListener("visibilitychange", checkForNewerDeployment);
    window.addEventListener("focus", checkForNewerDeployment);
    window.addEventListener("online", checkForNewerDeployment);
    return () => {
      document.removeEventListener("visibilitychange", checkForNewerDeployment);
      window.removeEventListener("focus", checkForNewerDeployment);
      window.removeEventListener("online", checkForNewerDeployment);
    };
  }, []);

  return (
    <>
      <div className={online ? "contents" : undefined} hidden={!online}>
        {children}
      </div>
      {!online && (
        <div
          role="status"
          className="fixed inset-0 z-[100] flex bg-background pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))]"
        >
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
            <Button onClick={() => window.location.reload()}>
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
