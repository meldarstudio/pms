import { useState, type FormEvent } from "react";
import { PageError } from "@/components/page-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

const MIN_PASSWORD_LENGTH = 12;
const mismatch = "Las contraseñas no coinciden.";
const tooShort = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;

function newPasswordError(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return tooShort;
  if (password !== confirmation) return mismatch;
  return null;
}

/** Owner-only account management: the staff password and the owner's own password. */
export function Accounts() {
  const session = useSession();
  const isOwner = session.data?.role === "owner";
  const accounts = useAccounts(isOwner);
  if (!isOwner)
    return (
      <main className="flex flex-col p-6">
        <p className="text-muted-foreground text-sm">
          Solo la cuenta del propietario puede administrar las cuentas.
        </p>
      </main>
    );
  if (accounts.isPending) return <Skeleton className="m-6 h-80" />;
  if (!accounts.data)
    return (
      <main className="flex flex-col p-6">
        <PageError error={accounts.error} onRetry={() => void accounts.refetch()} />
      </main>
    );
  const staff = accounts.data.filter((account) => account.role === "staff");
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <h1 className="text-lg font-semibold">Cuentas</h1>
      <div className="grid max-w-3xl gap-6 md:grid-cols-2">
        {staff.map((account) => (
          <StaffPasswordForm key={account.id} account={account} />
        ))}
        <OwnPasswordForm />
      </div>
    </main>
  );
}

function StaffPasswordForm({ account }: { account: Account }) {
  const save = useSetAccountPassword();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    const invalid = newPasswordError(password, confirmation);
    setError(invalid);
    setSaved(false);
    if (invalid) return;
    save.mutate(
      { id: account.id, password },
      {
        onSuccess: () => {
          setPassword("");
          setConfirmation("");
          setSaved(true);
        },
        onError: (cause) => setError(cause.message),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Personal</h2>
        </CardTitle>
        <CardDescription>
          Cuenta compartida <span className="font-medium">{account.username}</span>. Al cambiar la
          contraseña se cierra la sesión del personal en todos los dispositivos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="staffPassword">Nueva contraseña</FieldLabel>
              <Input
                id="staffPassword"
                name="staffPassword"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="staffPasswordConfirm">Repite la contraseña</FieldLabel>
              <Input
                id="staffPasswordConfirm"
                name="staffPasswordConfirm"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
            {saved ? (
              <p role="status" className="text-sm">
                Contraseña cambiada. Se cerró la sesión del personal; deben iniciar sesión con la
                nueva contraseña.
              </p>
            ) : null}
            <Button type="submit" disabled={save.isPending || !password}>
              {save.isPending ? <Spinner /> : null}
              Cambiar contraseña del personal
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function OwnPasswordForm() {
  const save = useChangeOwnPassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string }>({});
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    const invalid = newPasswordError(newPassword, confirmation);
    setErrors(invalid ? { newPassword: invalid } : {});
    setSaved(false);
    if (invalid) return;
    save.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmation("");
          setSaved(true);
        },
        onError: (cause) =>
          setErrors(
            cause instanceof ApiError && cause.field === "currentPassword"
              ? { currentPassword: cause.message }
              : { newPassword: cause.message },
          ),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Tu contraseña</h2>
        </CardTitle>
        <CardDescription>
          Se cerrarán tus otras sesiones; esta sesión sigue abierta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={errors.currentPassword ? true : undefined}>
              <FieldLabel htmlFor="currentPassword">Contraseña actual</FieldLabel>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.currentPassword ? true : undefined}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              {errors.currentPassword ? <FieldError>{errors.currentPassword}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="newPassword">Nueva contraseña</FieldLabel>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="newPasswordConfirm">Repite la nueva contraseña</FieldLabel>
              <Input
                id="newPasswordConfirm"
                name="newPasswordConfirm"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            {errors.newPassword ? <FieldError>{errors.newPassword}</FieldError> : null}
            {saved ? (
              <p role="status" className="text-sm">
                Contraseña cambiada.
              </p>
            ) : null}
            <Button type="submit" disabled={save.isPending || !currentPassword || !newPassword}>
              {save.isPending ? <Spinner /> : null}
              Cambiar mi contraseña
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
