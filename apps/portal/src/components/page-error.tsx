import { useEffect, type ReactNode } from "react";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { CircleAlertIcon, SearchXIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { readErrorKind, readErrorMessage } from "@/lib/api-error";
import { calendarSearch } from "@/lib/route-search";

/** Copy and action for a page whose record can be missing, such as one reservation. */
export type NotFoundState = { title: string; description: string; action: ReactNode };

/**
 * Replaces a page's content when its data could not be read and nothing is on screen.
 * Keep the page's own controls outside so staff can change dates or filters instead.
 */
export function PageError({
  error,
  onRetry,
  notFound,
}: {
  error: unknown;
  onRetry: () => void;
  notFound?: NotFoundState;
}) {
  const kind = readErrorKind(error);
  const message = readErrorMessage(error);
  useLogUnexplained(
    error,
    kind === "offline" || message !== null || (kind === "not-found" && !!notFound),
  );

  if (kind === "not-found" && notFound) {
    return (
      <Empty className="border" role="alert">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>{notFound.title}</EmptyTitle>
          <EmptyDescription>{notFound.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{notFound.action}</EmptyContent>
      </Empty>
    );
  }
  const offline = kind === "offline";
  return (
    <Empty className="border" role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">{offline ? <WifiOffIcon /> : <CircleAlertIcon />}</EmptyMedia>
        <EmptyTitle>
          {offline ? "Sin conexión con el servidor" : "No se pudieron cargar los datos"}
        </EmptyTitle>
        <EmptyDescription>
          {offline
            ? "Revisa tu conexión a internet e inténtalo de nuevo."
            : (message ?? "Ocurrió un error inesperado. Inténtalo de nuevo en unos momentos.")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Keeps data on screen when refreshing it failed, warning that it may be out of date. */
export function StaleDataNotice({
  error,
  onRetry,
  detail,
}: {
  error: unknown;
  onRetry: () => void;
  detail?: string;
}) {
  const kind = readErrorKind(error);
  const message = readErrorMessage(error);
  useLogUnexplained(error, kind === "offline" || message !== null);
  const offline = kind === "offline";
  const reason = offline ? "Sin conexión con el servidor." : (message ?? "No se pudo actualizar.");
  return (
    <Alert variant="warning" role="status" className="shrink-0">
      {offline ? <WifiOffIcon /> : <TriangleAlertIcon />}
      <AlertTitle>{reason}</AlertTitle>
      <AlertDescription>
        Los datos pueden estar desactualizados.{detail ? ` ${detail}` : null}
      </AlertDescription>
      <AlertAction className="top-1/2 -translate-y-1/2">
        <Button variant="outline" size="xs" onClick={onRetry}>
          Reintentar
        </Button>
      </AlertAction>
    </Alert>
  );
}

/** Staff see generic copy for errors without a translation; the console keeps the cause. */
function useLogUnexplained(error: unknown, explained: boolean) {
  useEffect(() => {
    if (!explained) console.error(error);
  }, [error, explained]);
}

/** The router's fallback when a page throws while rendering. */
export function RouteCrash({ error }: ErrorComponentProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="m-auto flex w-full max-w-md p-6">
      <Empty role="alert">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Algo salió mal</EmptyTitle>
          <EmptyDescription>
            Recarga la página para continuar. Si vuelve a ocurrir, ve al calendario.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button onClick={() => window.location.reload()}>Recargar</Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/calendar" search={calendarSearch({})} />}
          >
            Ir al calendario
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
