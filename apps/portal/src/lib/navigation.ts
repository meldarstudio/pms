import type { HistoryState, ParsedLocation } from "@tanstack/react-router";
import type { AccountRole } from "@/lib/api";

export const appNavigation = {
  reservations: { to: "/reservations", label: "Reservas" },
  calendar: { to: "/calendar", label: "Calendario" },
  housekeeping: { to: "/housekeeping", label: "Limpieza" },
  inventory: { to: "/inventory", label: "Inventario y tarifas" },
  complaints: { to: "/complaints", label: "Libro de Reclamaciones" },
  setup: { to: "/setup", label: "Configuración" },
} as const;

export function activeNavigation(pathname: string) {
  return Object.values(appNavigation).find(
    ({ to }) => pathname === to || pathname.startsWith(`${to}/`),
  );
}

export const configurationSections = [
  {
    id: "rooms",
    title: "Habitaciones",
    description: "Tipos, capacidad y tarifas base del alojamiento.",
  },
  { id: "appearance", title: "Apariencia", description: "Elige cómo prefieres ver el portal." },
  {
    id: "payments",
    title: "Pagos",
    description: "Pausa o reanuda los pagos con tarjeta de la web.",
  },
  {
    id: "accounts",
    title: "Cuentas",
    description: "Administra el acceso del personal y del propietario.",
  },
] as const;
export type ConfigurationSection = (typeof configurationSections)[number]["id"];
type ConfigurationSearch = { section?: Exclude<ConfigurationSection, "rooms"> };

export function configurationSearch(section: ConfigurationSection): ConfigurationSearch {
  return section === "rooms" ? {} : { section };
}

export function parseConfigurationSearch(search: Record<string, unknown>): ConfigurationSearch {
  const section = configurationSections.find((item) => item.id === search.section);
  return section ? configurationSearch(section.id) : {};
}

export function canOpenConfigurationSection(
  section: ConfigurationSection,
  role: AccountRole | undefined,
) {
  return (section !== "accounts" && section !== "payments") || role === "owner";
}

export function activeConfigurationSection({ pathname, search }: ParsedLocation) {
  if (pathname !== appNavigation.setup.to) return undefined;
  return parseConfigurationSearch(search).section ?? "rooms";
}

export function forceSameUrlNavigation(previous: HistoryState): HistoryState {
  return { ...previous, sameUrlNavigationNonce: crypto.randomUUID() };
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    sameUrlNavigationNonce?: string;
  }
}
