import { Fragment, useState, type ChangeEvent, type FormEvent } from "react";
import { ChevronRightIcon } from "lucide-react";
import {
  useReportEditorState,
  type ConfigurationEditorEvents,
} from "@/components/configuration-draft";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { SettingRow } from "@/components/setting-row";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { accountRoleTitles } from "@/lib/account-roles";
import type { Account, AccountRole } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { useAccounts, useChangeOwnPassword, useSetAccountPassword } from "@/lib/queries";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

const roleCopy: Record<
  AccountRole,
  {
    title: string;
    description: string;
    label: string;
    heading: string;
    notice: string;
    submit: string;
    saved: string;
  }
> = {
  owner: {
    title: accountRoleTitles.owner,
    description: "Operación y administración de cuentas",
    label: "propietario",
    heading: "Tu contraseña",
    notice: "Se cerrarán tus otras sesiones; esta sesión sigue abierta.",
    submit: "Cambiar mi contraseña",
    saved: "Contraseña cambiada.",
  },
  staff: {
    title: accountRoleTitles.staff,
    description: "Acceso compartido para la operación",
    label: "personal",
    heading: "Cuenta del personal",
    notice:
      "Acceso compartido. Al cambiar la contraseña, se cierra la sesión del personal en todos los dispositivos.",
    submit: "Cambiar contraseña del personal",
    saved:
      "Contraseña cambiada. Se cerró la sesión del personal; deben iniciar sesión con la nueva contraseña.",
  },
};

export function AccountsSection({
  account,
  onSelect,
  ...events
}: {
  account: Account | null;
  onSelect: (account: Account) => void;
} & ConfigurationEditorEvents) {
  const accounts = useAccounts(true);
  const retry = () => void accounts.refetch();
  if (account)
    return (
      <>
        {accounts.data && accounts.isError && (
          <StaleDataNotice
            error={accounts.error}
            onRetry={retry}
            detail="Tus cambios sin guardar se conservan."
          />
        )}
        <AccountPasswordEditor key={account.id} account={account} {...events} />
      </>
    );
  return (
    <>
      {accounts.data && accounts.isError && (
        <StaleDataNotice error={accounts.error} onRetry={retry} />
      )}
      {accounts.isPending ? (
        <div
          aria-busy="true"
          aria-label="Cargando cuentas"
          className="flex flex-col gap-4 border p-6"
        >
          <h2 className="text-sm font-medium">{roleCopy.staff.title}</h2>
          <Skeleton className="h-12" />
          <h2 className="text-sm font-medium">{roleCopy.owner.title}</h2>
          <Skeleton className="h-12" />
        </div>
      ) : !accounts.data ? (
        <PageError error={accounts.error} onRetry={retry} />
      ) : (
        <div className="border bg-muted/15">
          {accounts.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No hay cuentas para mostrar</EmptyTitle>
                <EmptyDescription>Solo se muestran los accesos existentes.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            accounts.data.map((account, index) => {
              const copy = roleCopy[account.role];
              return (
                <Fragment key={account.id}>
                  {index > 0 && <Separator />}
                  <SettingRow
                    title={copy.title}
                    description={`@${account.username} · ${copy.description}`}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => onSelect(account)}
                      aria-label={`Cambiar contraseña de ${copy.label}`}
                    >
                      Cambiar contraseña
                      <ChevronRightIcon data-icon="inline-end" />
                    </Button>
                  </SettingRow>
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </>
  );
}

function AccountPasswordEditor({
  account,
  ...events
}: { account: Account } & ConfigurationEditorEvents) {
  const own = useChangeOwnPassword();
  const staff = useSetAccountPassword();
  const owner = account.role === "owner";
  const copy = roleCopy[account.role];
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [outcome, setOutcome] = useState<
    | { kind: "editing" | "saved" }
    | { kind: "invalid"; errors: { currentPassword?: string; password?: string } }
  >({ kind: "editing" });
  const errors = outcome.kind === "invalid" ? outcome.errors : {};
  const saved = outcome.kind === "saved";
  const saving = own.isPending || staff.isPending;
  const dirty = !!(currentPassword || password || confirmation);
  useReportEditorState(events, dirty, saving);
  function edit(set: (value: string) => void) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setOutcome({ kind: "editing" });
      set(event.target.value);
    };
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const invalid =
      password.length < MIN_PASSWORD_LENGTH
        ? `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
        : password.length > MAX_PASSWORD_LENGTH
          ? `La contraseña debe tener como máximo ${MAX_PASSWORD_LENGTH} caracteres.`
          : password !== confirmation
            ? "Las contraseñas no coinciden."
            : undefined;
    const next = {
      ...(invalid ? { password: invalid } : {}),
      ...(owner && !currentPassword ? { currentPassword: "Indica tu contraseña actual." } : {}),
    };
    setOutcome(Object.keys(next).length ? { kind: "invalid", errors: next } : { kind: "editing" });
    if (Object.keys(next).length) {
      events.onSubmitFinished();
      return;
    }
    try {
      if (owner) await own.mutateAsync({ currentPassword, newPassword: password });
      else await staff.mutateAsync({ id: account.id, password });
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      setOutcome({ kind: "saved" });
      events.onSaved();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo cambiar la contraseña.";
      setOutcome({
        kind: "invalid",
        errors:
          cause instanceof ApiError && cause.field === "currentPassword"
            ? { currentPassword: message }
            : { password: message },
      });
    } finally {
      events.onSubmitFinished();
    }
  }
  const passwordId = owner ? "newPassword" : "staffPassword";
  return (
    <div className="flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{copy.heading}</h2>
        <p className="text-xs text-muted-foreground">{copy.notice}</p>
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
                onChange={edit(setCurrentPassword)}
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
              onChange={edit(setPassword)}
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
              onChange={edit(setConfirmation)}
            />
          </Field>
        </FieldGroup>
        {saved && (
          <p role="status" className="text-xs">
            {copy.saved}
          </p>
        )}
        <Separator />
        <footer className="flex justify-end max-sm:[&>button]:flex-1">
          <Button type="submit" disabled={saving || !dirty}>
            {saving && <Spinner data-icon="inline-start" />}
            {copy.submit}
          </Button>
        </footer>
      </form>
    </div>
  );
}
