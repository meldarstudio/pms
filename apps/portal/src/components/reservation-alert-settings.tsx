import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useReservationAlertBrowser,
  useReservationAlertSettings,
  useSetReservationAlertDevice,
} from "@/lib/queries";
import {
  reservationAlertDeviceId,
  subscribeToReservationAlerts,
  subscriptionUsesKey,
} from "@/lib/reservation-alert-device";
import { toastError } from "@/lib/toast";

export function ReservationAlertSettings({ onClose }: { onClose: () => void }) {
  const [deviceId, setDeviceId] = useState(reservationAlertDeviceId);
  const [subscribing, setSubscribing] = useState(false);
  const settings = useReservationAlertSettings(deviceId);
  const browser = useReservationAlertBrowser();
  const save = useSetReservationAlertDevice();
  const device = browser.data;
  const publicKey = settings.data?.publicKey;
  const enrolled = settings.data?.enabled;
  const busy = subscribing || save.isPending;
  const active = Boolean(
    enrolled &&
    publicKey &&
    device?.status === "ready" &&
    device.permission === "granted" &&
    device.subscription &&
    subscriptionUsesKey(device.subscription, publicKey),
  );
  const canEnable =
    publicKey && device?.status === "ready" && device.permission !== "denied" && !active;

  async function enable() {
    if (!publicKey || device?.status !== "ready" || busy) return;
    setSubscribing(true);
    try {
      const subscription = await subscribeToReservationAlerts(device, publicKey);
      setDeviceId(subscription.deviceId);
      await save.mutateAsync(subscription);
    } catch (cause) {
      if (Notification.permission !== "denied")
        toastError("No se pudieron activar los avisos.", cause);
      void browser.refetch();
    } finally {
      setSubscribing(false);
    }
  }

  const status =
    settings.isPending || browser.isPending
      ? "Comprobando los avisos en este dispositivo…"
      : settings.isError || browser.isError
        ? "No se pudo comprobar la configuración de avisos."
        : !publicKey
          ? "Los avisos de reservas aún no están disponibles."
          : device?.status === "unsupported"
            ? "Este navegador no admite avisos. En iPhone, abre el portal desde la pantalla de inicio."
            : device?.status === "unavailable"
              ? "Recarga el portal para que este dispositivo pueda recibir avisos."
              : device?.permission === "denied"
                ? "Los avisos están bloqueados. Permítelos en los ajustes del navegador o del dispositivo."
                : active
                  ? "Los avisos están activados en este dispositivo."
                  : "Los avisos no están activados en este dispositivo.";

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle>Notificaciones</DialogTitle>
          <DialogDescription>
            Recibe un aviso en este dispositivo cuando se confirme una nueva reserva web.
          </DialogDescription>
        </DialogHeader>
        <p role="status">{status}</p>
        <DialogFooter>
          {enrolled && deviceId && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                save.mutate(deviceId, {
                  onError: (cause) => toastError("No se pudieron desactivar los avisos.", cause),
                })
              }
            >
              Desactivar avisos
            </Button>
          )}
          {canEnable && (
            <Button disabled={busy} onClick={() => void enable()}>
              {busy ? "Guardando…" : "Activar avisos"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
