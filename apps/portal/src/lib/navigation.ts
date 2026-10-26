export const appNavigation = {
  reservations: { to: "/reservations", label: "Reservas" },
  calendar: { to: "/calendar", label: "Calendario" },
  housekeeping: { to: "/housekeeping", label: "Limpieza" },
  inventory: { to: "/inventory", label: "Inventario y tarifas" },
  setup: { to: "/setup", label: "Configuración" },
  accounts: { to: "/accounts", label: "Cuentas" },
} as const;

export function activeNavigation(pathname: string) {
  return Object.values(appNavigation).find(
    ({ to }) => pathname === to || pathname.startsWith(`${to}/`),
  );
}
