import { Fragment, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BedDoubleIcon,
  ChevronRightIcon,
  PaletteIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { cn } from "cn";
import { AccountPasswordEditor, AccountSettings } from "@/components/accounts";
import { useConfigurationDraft } from "@/components/configuration-draft";
import { PageTitle } from "@/components/page-title";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { RoomTypeEditor } from "@/components/room-type-editor";
import { SettingRow } from "@/components/setting-row";
import { useTheme } from "@/components/theme-provider";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Account, Room, RoomType } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useAccounts, useRooms, useRoomTypes, useSession } from "@/lib/queries";

const sections = [
  {
    id: "rooms",
    title: "Habitaciones",
    description: "Tipos, capacidad y tarifas base del alojamiento.",
    icon: BedDoubleIcon,
  },
  {
    id: "appearance",
    title: "Apariencia",
    description: "Elige cómo prefieres ver el portal.",
    icon: PaletteIcon,
  },
  {
    id: "accounts",
    title: "Cuentas",
    description: "Administra el acceso del personal y del propietario.",
    icon: ShieldCheckIcon,
  },
] as const;
export type ConfigurationSection = (typeof sections)[number]["id"];

export function PropertySetup({ section = "rooms" }: { section?: ConfigurationSection }) {
  const navigate = useNavigate();
  const types = useRoomTypes();
  const rooms = useRooms();
  const isOwner = useSession().data?.role === "owner";
  const accounts = useAccounts(isOwner && section === "accounts");
  // Snapshot opening values: background reads must not replace an editor draft.
  const [roomEditor, setRoomEditor] = useState<{ type?: RoomType; rooms: Room[] } | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const editorOpen = roomEditor !== null || account !== null;
  const formId = roomEditor ? "property-setup-form" : account ? "account-password-form" : undefined;
  const draft = useConfigurationDraft(formId, () => {
    setRoomEditor(null);
    setAccount(null);
  });
  const active = sections.find((item) => item.id === section)!;
  const sectionOptions = sections
    .filter((item) => item.id !== "accounts" || isOwner)
    .map((item) => ({ value: item.id, label: item.title }));
  const title = roomEditor
    ? (roomEditor.type?.name ?? "Nuevo tipo")
    : account
      ? "Cambiar contraseña"
      : active.title;
  function close() {
    draft.request(() => {
      setRoomEditor(null);
      setAccount(null);
    });
  }
  function openType(type?: RoomType) {
    setRoomEditor({
      type,
      rooms: (rooms.data ?? []).filter((room) => room.roomTypeId === type?.id),
    });
  }
  function retry() {
    if (types.error) void types.refetch();
    if (rooms.error) void rooms.refetch();
  }
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 lg:p-6">
      <PageTitle>
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className={cn("shrink-0", editorOpen && "hidden sm:inline-flex")}>
              <BreadcrumbLink
                render={
                  <Link
                    to="/setup"
                    search={{}}
                    onClick={
                      section === "rooms"
                        ? (event) => {
                            event.preventDefault();
                            close();
                          }
                        : undefined
                    }
                  />
                }
              >
                Configuración
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className={cn(editorOpen && "hidden sm:list-item")} />
            {editorOpen && (
              <>
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbLink render={<button type="button" onClick={close} />}>
                    {active.title}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate" title={title}>
                {title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageTitle>
      <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-8 pt-2 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-12 md:pt-6 xl:gap-20">
        <aside className="hidden flex-col gap-5 md:flex">
          <p className="text-sm font-medium">Configuración</p>
          <nav aria-label="Secciones de configuración" className="flex flex-col gap-1">
            {sections
              .filter((item) => item.id !== "accounts" || isOwner)
              .map(({ id, title, icon: Icon }) => (
                <Button
                  key={id}
                  nativeButton={false}
                  role="link"
                  variant={section === id ? "secondary" : "ghost"}
                  className="justify-start"
                  disabled={draft.saving}
                  aria-current={section === id ? "page" : undefined}
                  render={
                    <Link
                      to="/setup"
                      search={id === "rooms" ? {} : { section: id }}
                      onClick={
                        section === id
                          ? (event) => {
                              event.preventDefault();
                              close();
                            }
                          : undefined
                      }
                    />
                  }
                >
                  <Icon data-icon="inline-start" />
                  {title}
                </Button>
              ))}
          </nav>
        </aside>
        <section className="flex min-w-0 flex-col gap-8" aria-labelledby="configuration-title">
          <header className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <h1 id="configuration-title" className="break-words text-lg font-semibold">
                {title}
              </h1>
              <p className="text-xs text-muted-foreground">
                {roomEditor
                  ? "Guarda el tipo completo cuando termines de editar."
                  : account
                    ? `Cuenta @${account.username}`
                    : active.description}
              </p>
            </div>
            <Select
              items={sectionOptions}
              value={section}
              disabled={draft.saving}
              onValueChange={(value) => {
                if (
                  value === "rooms" ||
                  value === "appearance" ||
                  (value === "accounts" && isOwner)
                )
                  void navigate({
                    to: "/setup",
                    search: value === "rooms" ? {} : { section: value },
                  });
              }}
            >
              <SelectTrigger
                aria-label="Secciones de configuración"
                className="w-36 shrink-0 md:hidden"
              >
                <SelectValue>{active.title}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sectionOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </header>
          {section === "rooms" && (
            <>
              {(types.error || rooms.error) && types.data && rooms.data && (
                <StaleDataNotice
                  error={types.error ?? rooms.error}
                  onRetry={retry}
                  detail="Tus cambios sin guardar se conservan."
                />
              )}
              {roomEditor ? (
                <RoomTypeEditor
                  type={roomEditor.type}
                  rooms={roomEditor.rooms}
                  allRooms={rooms.data ?? []}
                  onTypeSaved={(type, rooms) =>
                    setRoomEditor((current) => (current ? { type, rooms } : null))
                  }
                  {...draft.events}
                />
              ) : types.isPending || rooms.isPending ? (
                <div
                  aria-label="Cargando habitaciones"
                  aria-busy="true"
                  className="flex flex-col gap-4"
                >
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              ) : !types.data || !rooms.data ? (
                <PageError error={types.error ?? rooms.error} onRetry={retry} />
              ) : (
                <>
                  <div className="min-w-0 border bg-muted/15">
                    {types.data.map((type, index) => (
                      <Fragment key={type.id}>
                        {index > 0 && <Separator />}
                        <SettingRow
                          title={type.name}
                          description={`${rooms.data.filter((room) => room.roomTypeId === type.id).length} habitaciones · hasta ${type.maxAdults} ${type.maxAdults === 1 ? "adulto" : "adultos"} y ${type.maxChildren} ${type.maxChildren === 1 ? "niño" : "niños"}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatMoney(type.baseRateCents)} / noche
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar ${type.name}`}
                              onClick={() => openType(type)}
                            >
                              <ChevronRightIcon />
                            </Button>
                          </div>
                        </SettingRow>
                      </Fragment>
                    ))}
                    {types.data.length === 0 ? (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>Aún no hay tipos de habitación</EmptyTitle>
                          <EmptyDescription>
                            Crea un tipo y agrega sus números cuando quieras.
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                          <Button variant="outline" onClick={() => openType()}>
                            Crear el primer tipo
                          </Button>
                        </EmptyContent>
                      </Empty>
                    ) : (
                      <>
                        <Separator />
                        <SettingRow
                          title="Agregar tipo"
                          description="Define otra tarifa base y capacidad."
                        >
                          <Button variant="ghost" onClick={() => openType()}>
                            <PlusIcon data-icon="inline-start" />
                            Agregar
                          </Button>
                        </SettingRow>
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          {section === "appearance" && <AppearanceSettings />}
          {section === "accounts" && account && accounts.data && accounts.isError && (
            <StaleDataNotice
              error={accounts.error}
              onRetry={() => void accounts.refetch()}
              detail="Tus cambios sin guardar se conservan."
            />
          )}
          {section === "accounts" &&
            (isOwner ? (
              account ? (
                <AccountPasswordEditor key={account.id} account={account} {...draft.events} />
              ) : (
                <AccountSettings onSelect={setAccount} />
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                Solo la cuenta del propietario puede administrar las cuentas.
              </p>
            ))}
        </section>
      </div>
      {draft.dialog}
    </main>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const themes = [
    { value: "system", label: "Sistema" },
    { value: "light", label: "Claro" },
    { value: "dark", label: "Oscuro" },
  ];
  return (
    <div className="border bg-muted/15 px-4 sm:px-6">
      <FieldGroup className="gap-0">
        <Field orientation="responsive" className="py-5">
          <FieldContent>
            <FieldLabel htmlFor="configuration-theme">Esquema de color</FieldLabel>
            <FieldDescription>Sigue el sistema o elige un tema claro u oscuro.</FieldDescription>
          </FieldContent>
          <Select
            items={themes}
            value={theme}
            onValueChange={(value) => {
              if (value === "light" || value === "dark" || value === "system") setTheme(value);
            }}
          >
            <SelectTrigger id="configuration-theme" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {themes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </div>
  );
}
