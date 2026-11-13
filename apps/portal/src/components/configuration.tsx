import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
import type { Account } from "@/lib/api";
import { configurationSections, type ConfigurationSection } from "@/lib/navigation";

export function Configuration({ section }: { section: ConfigurationSection }) {
  const [editor, setEditor] = useState<
    | { kind: "closed" }
    | { kind: "room"; target: RoomTypeEditorTarget }
    | { kind: "account"; account: Account }
  >({ kind: "closed" });
  const roomEditor = editor.kind === "room" ? editor.target : null;
  const account = editor.kind === "account" ? editor.account : null;
  const editorOpen = editor.kind !== "closed";
  const formId = roomEditor ? "property-setup-form" : account ? "account-password-form" : undefined;
  const closeEditor = () => setEditor({ kind: "closed" });
  const draft = useConfigurationDraft(formId, closeEditor);
  const active = configurationSections.find((item) => item.id === section)!;
  const title = roomEditor
    ? (roomEditor.type?.name ?? "Nuevo tipo")
    : account
      ? "Cambiar contraseña"
      : active.title;
  function close() {
    draft.request(closeEditor);
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
      <section
        className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 pt-2 md:pt-6"
        aria-labelledby="configuration-title"
      >
        <header className="flex min-w-0 flex-col gap-2">
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
        </header>
        {section === "rooms" && (
          <RoomTypesSection
            editor={roomEditor}
            onOpen={(target) => setEditor({ kind: "room", target })}
            onTypeSaved={(type, rooms) =>
              setEditor((current) =>
                current.kind === "room" ? { kind: "room", target: { type, rooms } } : current,
              )
            }
            {...draft.events}
          />
        )}
        {section === "appearance" && <AppearanceSettings />}
        {section === "accounts" && (
          <AccountsSection
            account={account}
            onSelect={(account) => setEditor({ kind: "account", account })}
            {...draft.events}
          />
        )}
      </section>
      {draft.dialog}
    </main>
  );
}
