import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BedDoubleIcon, PaletteIcon, ShieldCheckIcon } from "lucide-react";
import { cn } from "cn";
import { AccountsSection } from "@/components/accounts";
import { AppearanceSettings } from "@/components/appearance-settings";
import { useConfigurationDraft } from "@/components/configuration-draft";
import { PageTitle } from "@/components/page-title";
import { RoomTypesSection, type RoomTypeEditorTarget } from "@/components/room-types-section";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account } from "@/lib/api";
import { useSession } from "@/lib/queries";

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
type ConfigurationSearch = { section?: Exclude<ConfigurationSection, "rooms"> };

export function configurationSearch(section: ConfigurationSection): ConfigurationSearch {
  return section === "rooms" ? {} : { section };
}

export function parseConfigurationSearch(search: Record<string, unknown>): ConfigurationSearch {
  const section = sections.find((item) => item.id === search.section);
  return section ? configurationSearch(section.id) : {};
}

export function Configuration({ section }: { section: ConfigurationSection }) {
  const navigate = useNavigate();
  const isOwner = useSession().data?.role === "owner";
  const visibleSections = sections.filter((item) => item.id !== "accounts" || isOwner);
  const [roomEditor, setRoomEditor] = useState<RoomTypeEditorTarget | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const editorOpen = roomEditor !== null || account !== null;
  const formId = roomEditor ? "property-setup-form" : account ? "account-password-form" : undefined;
  const draft = useConfigurationDraft(formId, () => {
    setRoomEditor(null);
    setAccount(null);
  });
  const active = sections.find((item) => item.id === section)!;
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
      <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-8 pt-2 md:pt-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 xl:gap-20">
        <aside className="hidden flex-col gap-5 lg:flex">
          <p className="text-sm font-medium">Configuración</p>
          <nav aria-label="Secciones de configuración" className="flex flex-col gap-1">
            {visibleSections.map(({ id, title, icon: Icon }) => (
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
                    search={configurationSearch(id)}
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
              items={visibleSections.map((item) => ({ value: item.id, label: item.title }))}
              value={section}
              disabled={draft.saving}
              onValueChange={(value) => {
                const next = visibleSections.find((item) => item.id === value);
                if (next) void navigate({ to: "/setup", search: configurationSearch(next.id) });
              }}
            >
              <SelectTrigger
                aria-label="Secciones de configuración"
                className="w-36 shrink-0 lg:hidden"
              >
                <SelectValue>{active.title}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {visibleSections.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </header>
          {section === "rooms" && (
            <RoomTypesSection
              editor={roomEditor}
              onOpen={setRoomEditor}
              onTypeSaved={(type, rooms) =>
                setRoomEditor((current) => (current ? { type, rooms } : null))
              }
              {...draft.events}
            />
          )}
          {section === "appearance" && <AppearanceSettings />}
          {section === "accounts" && (
            <AccountsSection account={account} onSelect={setAccount} {...draft.events} />
          )}
        </section>
      </div>
      {draft.dialog}
    </main>
  );
}
