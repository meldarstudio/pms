import { Fragment, useEffect, useState, type FormEvent } from "react";
import { ChevronRightIcon } from "lucide-react";
import type { ConfigurationEditorEvents } from "@/components/configuration-draft";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { SettingRow } from "@/components/setting-row";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { Account } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import {
  useAccounts,
  useChangeOwnPassword,
  useSession,
  useSetAccountPassword,
} from "@/lib/queries";

/** Mounted only in the owner-only configuration section. */
export function AccountSettings({ onSelect }: { onSelect: (account: Account) => void }) {
  const isOwner = useSession().data?.role === "owner";
  const accounts = useAccounts(isOwner);
  return (
    <>
      {accounts.data && accounts.isError && (
        <StaleDataNotice error={accounts.error} onRetry={() => void accounts.refetch()} />
      )}
      {accounts.isPending ? (
        <div
          aria-busy="true"
          aria-label="Cargando cuentas"
          className="flex flex-col gap-4 border p-6"
        >
          <h2 className="text-sm font-medium">Personal</h2>
          <Skeleton className="h-12" />
          <h2 className="text-sm font-medium">Propietario</h2>
          <Skeleton className="h-12" />
        </div>
      ) : !accounts.data ? (
        <PageError error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : (
        <div className="border bg-muted/15 px-4 sm:px-6">
          {accounts.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No hay cuentas para mostrar</EmptyTitle>
                <EmptyDescription>Solo se muestran los accesos existentes.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            accounts.data.map((account, index) => (
              <Fragment key={account.id}>
                {index > 0 && <Separator />}
                <SettingRow
                  title={account.role === "owner" ? "Propietario" : "Personal"}
                  description={`@${account.username} · ${account.role === "owner" ? "Operación y administración de cuentas" : "Acceso compartido para la operación"}`}
                >
                  <Button
                    variant="ghost"
                    onClick={() => onSelect(account)}
                    aria-label={`Cambiar contraseña de ${account.role === "owner" ? "propietario" : "personal"}`}
                  >
                    Cambiar contraseña
                    <ChevronRightIcon data-icon="inline-end" />
                  </Button>
                </SettingRow>
              </Fragment>
            ))
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Solo el propietario puede cambiar contraseñas. No se crean cuentas ni se editan roles desde
        el portal.
      </p>
    </>
  );
}

export function AccountPasswordEditor({
  account,
  onDirtyChange,
  onSavingChange,
  onSaved,
  onSubmitFinished,
}: { account: Account } & ConfigurationEditorEvents) {
  const own = useChangeOwnPassword();
  const staff = useSetAccountPassword();
  const owner = account.role === "owner";
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ currentPassword?: string; password?: string }>({});
  const [saved, setSaved] = useState(false);
  const saving = own.isPending || staff.isPending;
  const dirty = !!(currentPassword || password || confirmation);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onSavingChange(saving), [saving, onSavingChange]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const invalid =
      password.length < 12
        ? "La contraseña debe tener al menos 12 caracteres."
        : password.length > 128
          ? "La contraseña debe tener como máximo 128 caracteres."
          : password !== confirmation
            ? "Las contraseñas no coinciden."
            : undefined;
    const next = {
      ...(invalid ? { password: invalid } : {}),
      ...(owner && !currentPassword ? { currentPassword: "Indica tu contraseña actual." } : {}),
    };
    setErrors(next);
    setSaved(false);
    if (Object.keys(next).length) {
      onSubmitFinished();
      return;
    }
    try {
      if (owner) await own.mutateAsync({ currentPassword, newPassword: password });
      else await staff.mutateAsync({ id: account.id, password });
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      setSaved(true);
      onSaved();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo cambiar la contraseña.";
      setErrors(
        cause instanceof ApiError && cause.field === "currentPassword"
          ? { currentPassword: message }
          : { password: message },
      );
    } finally {
      onSubmitFinished();
    }
  }
  const passwordId = owner ? "newPassword" : "staffPassword";
  return (
    <div className="flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{owner ? "Tu contraseña" : "Cuenta del personal"}</h2>
        <p className="text-xs text-muted-foreground">
          {owner
            ? "Se cerrarán tus otras sesiones; esta sesión sigue abierta."
            : "Acceso compartido. Al cambiar la contraseña, se cierra la sesión del personal en todos los dispositivos."}
        </p>
      </header>
      <form
        id="account-password-form"
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-col gap-6"
      >
        <FieldGroup>
          {owner && (
            <Field data-invalid={!!errors.currentPassword} data-disabled={saving}>
              <FieldLabel htmlFor="currentPassword">Contraseña actual</FieldLabel>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                disabled={saving}
                aria-invalid={!!errors.currentPassword}
                aria-describedby={errors.currentPassword ? "currentPasswordError" : undefined}
                onChange={(event) => {
                  setErrors({});
                  setSaved(false);
                  setCurrentPassword(event.target.value);
                }}
              />
              {errors.currentPassword && (
                <FieldError id="currentPasswordError">{errors.currentPassword}</FieldError>
              )}
            </Field>
          )}
          <Field data-invalid={!!errors.password} data-disabled={saving}>
            <FieldLabel htmlFor={passwordId}>Nueva contraseña</FieldLabel>
            <Input
              id={passwordId}
              name={passwordId}
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={saving}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "passwordError" : undefined}
              onChange={(event) => {
                setErrors({});
                setSaved(false);
                setPassword(event.target.value);
              }}
            />
            {errors.password && <FieldError id="passwordError">{errors.password}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.password} data-disabled={saving}>
            <FieldLabel htmlFor={`${passwordId}Confirm`}>Repite la nueva contraseña</FieldLabel>
            <Input
              id={`${passwordId}Confirm`}
              name={`${passwordId}Confirm`}
              type="password"
              autoComplete="new-password"
              value={confirmation}
              disabled={saving}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "passwordError" : undefined}
              onChange={(event) => {
                setErrors({});
                setSaved(false);
                setConfirmation(event.target.value);
              }}
            />
          </Field>
        </FieldGroup>
        {saved && (
          <p role="status" className="text-xs">
            {owner
              ? "Contraseña cambiada."
              : "Contraseña cambiada. Se cerró la sesión del personal; deben iniciar sesión con la nueva contraseña."}
          </p>
        )}
        <Separator />
        <footer className="flex justify-end">
          <Button type="submit" disabled={saving || !dirty}>
            {saving && <Spinner data-icon="inline-start" />}
            {owner ? "Cambiar mi contraseña" : "Cambiar contraseña del personal"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
