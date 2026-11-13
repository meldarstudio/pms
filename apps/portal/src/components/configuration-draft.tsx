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

export function useReportEditorState(
  { onDirtyChange, onSavingChange }: ConfigurationEditorEvents,
  dirty: boolean,
  saving: boolean,
) {
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onSavingChange(saving), [saving, onSavingChange]);
}

export function useConfigurationDraft(formId: string | undefined, onDiscard: () => void) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  type Navigation =
    | { kind: "idle" }
    | { kind: "confirming"; run: () => void }
    | { kind: "after-save"; router: boolean; run: () => void };
  const [navigation, setNavigation] = useState<Navigation>({ kind: "idle" });
  const currentNavigation = useRef(navigation);
  function navigate(next: Navigation) {
    currentNavigation.current = next;
    setNavigation(next);
  }
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
    navigate({ kind: "idle" });
    if (latestBlocker.current.status === "blocked") latestBlocker.current.reset();
  }

  function request(run: () => void) {
    if (saving) return;
    if (dirty) navigate({ kind: "confirming", run });
    else run();
  }

  const events: ConfigurationEditorEvents = {
    onDirtyChange: setDirty,
    onSavingChange: setSaving,
    onSaved: () => {
      setDirty(false);
      setSaving(false);
      const intent = currentNavigation.current;
      const next = intent.kind === "after-save" ? intent : null;
      navigate({ kind: "idle" });
      if (!next?.router && latestBlocker.current.status === "blocked")
        latestBlocker.current.reset();
      next?.run();
    },
    onSubmitFinished: () => {
      if (currentNavigation.current.kind === "after-save") stay();
    },
  };

  return {
    request,
    saving,
    events,
    dialog: (
      <AlertDialog
        open={navigation.kind !== "idle" || blocker.status === "blocked"}
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
                const next = currentNavigation.current;
                navigate({ kind: "idle" });
                if (blocker.status === "blocked") blocker.proceed();
                else if (next.kind !== "idle") next.run();
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
                  if (blocker.status === "blocked")
                    navigate({ kind: "after-save", router: true, run: blocker.proceed });
                  else if (navigation.kind === "confirming")
                    navigate({ kind: "after-save", router: false, run: navigation.run });
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
