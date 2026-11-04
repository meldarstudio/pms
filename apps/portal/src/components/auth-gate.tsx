import { useState, type FormEvent, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { HotelLogo } from "@/components/hotel-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useLogin, useSession, useSignedOutOnUnauthorized } from "@/lib/queries";

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  useSignedOutOnUnauthorized();

  if (session.isPending) {
    return (
      <main className="flex h-svh items-center justify-center">
        <Spinner className="size-6" />
      </main>
    );
  }
  if (session.isError) {
    return (
      <main className="flex h-svh flex-col items-center justify-center gap-3 px-[max(2rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-8 text-center">
        <p className="text-sm">{session.error.message}</p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Reintentar
        </Button>
      </main>
    );
  }
  if (!session.data) return <LoginPage />;
  return children;
}

function LoginPage() {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (login.isPending) return;
    login.mutate({ username: username.trim(), password });
  }

  return (
    <main className="bg-muted/30 flex min-h-svh items-center justify-center pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] safe-area-padding-x">
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center py-2">
          <CardTitle>
            <h1>
              <HotelLogo className="h-9 w-36 text-foreground" />
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username">Usuario</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      size="icon-xs"
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              {login.isError ? <FieldError>{login.error.message}</FieldError> : null}
              <Button type="submit" disabled={login.isPending || !username.trim() || !password}>
                {login.isPending ? <Spinner /> : null}
                Iniciar sesión
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
