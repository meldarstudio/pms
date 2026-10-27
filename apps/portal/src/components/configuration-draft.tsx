import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ConfigurationEditorEvents = {
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
  onSubmitFinished: () => void;
};

/** One guard for local editor navigation, router navigation, and browser unload. */
export function useConfigurationDraft(formId: string | undefined, onDiscard: () => void) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ run: () => void } | null>(null);
  const afterSave = useRef<{ router: boolean; run: () => void } | null>(null);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || saving,
    enableBeforeUnload: () => dirty || saving,
    withResolver: true,
  });
  const latestBlocker = useRef(blocker);
  useEffect(() => {
    latestBlocker.current = blocker;
  }, [blocker]);

  function stay() {
    setPending(null);
    if (latestBlocker.current.status === "blocked") latestBlocker.current.reset();
  }

  function request(run: () => void) {
    if (saving) return;
    if (dirty) setPending({ run });
    else run();
  }

  const events: ConfigurationEditorEvents = {
    onDirtyChange: setDirty,
    onSavingChange: setSaving,
    onSaved: () => {
      setDirty(false);
      setSaving(false);
      const next = afterSave.current;
      afterSave.current = null;
      setPending(null);
      if (!next?.router && latestBlocker.current.status === "blocked")
        latestBlocker.current.reset();
      next?.run();
    },
    onSubmitFinished: () => {
      if (afterSave.current) {
        afterSave.current = null;
        stay();
      }
    },
  };

  return {
    request,
    saving,
    events,
    dialog: (
      <AlertDialog
        open={pending !== null || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && !saving) stay();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {saving ? "Guardando cambios" : "Hay cambios sin guardar"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {saving
                ? "Espera a que termine el guardado antes de salir."
                : "Guarda o descarta el borrador antes de continuar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={saving} onClick={stay}>
              Seguir editando
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                setDirty(false);
                onDiscard();
                const next = pending;
                setPending(null);
                if (blocker.status === "blocked") blocker.proceed();
                else next?.run();
              }}
            >
              Descartar cambios
            </Button>
            {formId && (
              <Button
                type="submit"
                form={formId}
                disabled={saving}
                onClick={() => {
                  afterSave.current =
                    blocker.status === "blocked"
                      ? { router: true, run: blocker.proceed }
                      : pending
                        ? { router: false, run: pending.run }
                        : null;
                }}
              >
                Guardar y continuar
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}
