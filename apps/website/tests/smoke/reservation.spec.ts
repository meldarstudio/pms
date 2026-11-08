import { expect, test, type Page } from "@playwright/test";
import {
  LOCAL_API_URL,
  allSoldOutStay,
  daysFromToday,
  doubleSoldOutStay,
  openStay,
} from "../support/local-api";

const offersRoute = `${LOCAL_API_URL}/public/offers*`;

const longDate = (label: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${label}T00:00:00Z`));

function choosePath(
  stay: { checkIn: string; checkOut: string },
  extra: Record<string, string> = {},
  lang = "",
) {
  const params = new URLSearchParams({ ...stay, adults: "2", children: "0", ...extra });
  return `${lang}/reservar/habitacion/?${params.toString()}`;
}

const room = (page: Page, name: string) => page.getByRole("article", { name });

test("a room-specific entry searches live prices and compares both plans", async ({ page }) => {
  const stay = openStay();
  await page.goto("/habitaciones/");
  await page.getByRole("link", { name: "Ver precios y disponibilidad: Suite Matrimonial" }).click();

  await expect(page).toHaveURL(/\/reservar\/\?room=king$/);
  await expect(page.getByText("Habitación preferida: Suite Matrimonial")).toBeVisible();
  await expect(page.getByLabel("Llegada")).toHaveValue("");
  await expect(page.getByLabel("Salida")).toHaveValue("");
  await expect(page.getByLabel("Adultos")).toHaveValue("2");
  await expect(page.getByLabel("Niños")).toHaveValue("0");
  await page.getByLabel("Llegada").fill(stay.checkIn);
  await page.getByLabel("Salida").fill(stay.checkOut);
  await expect(page.getByText("2 noches")).toBeVisible();
  await page.getByRole("button", { name: "Ver habitaciones y precios" }).click();

  await expect(page).toHaveURL(/\/reservar\/habitacion\/\?/);
  await expect(page.getByText(/2 noches · 2 adultos/)).toBeVisible();
  const king = room(page, "Suite Matrimonial");
  await expect(page.locator("[data-results] > li:not([hidden])").first()).toHaveAttribute(
    "data-room",
    "king",
  );
  await expect(king.getByText("Su habitación preferida")).toBeVisible();
  await expect(king.getByRole("radio", { name: /Flexible/ })).toBeChecked();
  const flexible = king.locator('[data-plan="flexible"]');
  await expect(flexible.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
  await expect(flexible.locator('[data-amount="now"]')).toHaveText(/S\/\s100\.00/);
  await expect(flexible.locator('[data-amount="remaining"]')).toHaveText(/S\/\s100\.00/);
  await expect(flexible).toContainText(
    `Cancelación gratuita hasta el ${longDate(daysFromToday(118), "es-PE")} inclusive`,
  );
  const nonRefundable = king.locator('[data-plan="non_refundable"]');
  await expect(nonRefundable.locator('[data-amount="total"]')).toHaveText(/S\/\s180\.00/);
  await expect(nonRefundable.locator('[data-amount="now"]')).toHaveText(/S\/\s180\.00/);
  await expect(nonRefundable.locator('[data-amount="remaining"]')).toHaveText(/S\/\s0\.00/);
  await expect(nonRefundable).toContainText(/Ahorra S\/\s20\.00/);
  await expect(nonRefundable).toContainText(/se cobra toda la estadía, S\/\s180\.00/);
  await expect(room(page, "Suite Familiar")).toContainText(
    "Esta habitación no se puede reservar en línea",
  );
  await expect(page.getByRole("region", { name: "Su elección" })).toBeHidden();

  await king.getByRole("radio", { name: /No reembolsable/ }).check();
  await king.getByRole("button", { name: "Elegir esta habitación: Suite Matrimonial" }).click();

  const choice = page.getByRole("region", { name: "Su elección" });
  await expect(choice).toBeFocused();
  await expect(choice).toContainText("Suite Matrimonial · tarifa No reembolsable");
  await expect(page).toHaveURL(/room=king&plan=non_refundable/);
  const whatsapp = new URL(
    (await choice
      .getByRole("link", { name: "Enviar mi elección por WhatsApp" })
      .getAttribute("href"))!,
  );
  expect(whatsapp.searchParams.get("text")).toMatch(
    /Fechas: .+ \(2 noches\) Personas: 2 adultos Habitación: Suite Matrimonial Tarifa: No reembolsable Total: S\/\s180\.00/,
  );
});

test("language changes and back navigation keep the search and choice", async ({ page }) => {
  const stay = openStay();
  await page.goto("/reservar/");
  await page.getByLabel("Llegada").fill(stay.checkIn);
  await page.getByLabel("Salida").fill(stay.checkOut);
  await page.getByLabel("Niños").selectOption("1");
  await page.getByRole("button", { name: "Ver habitaciones y precios" }).click();
  const double = room(page, "Doble Premium");
  await double.getByRole("radio", { name: /No reembolsable/ }).check();
  await double.getByRole("button", { name: /Elegir esta habitación/ }).click();

  await page.locator("#lang-select").selectOption({ label: "English" });

  await expect(page).toHaveURL(/\/en\/reservar\/habitacion\/\?.*room=double&plan=non_refundable/);
  const choice = page.getByRole("region", { name: "Your choice" });
  await expect(choice).toContainText("Premium double · Non-refundable rate");
  await expect(choice).toContainText(/S\/\s216\.00/);
  await expect(
    room(page, "Premium double").getByRole("radio", { name: /Non-refundable/ }),
  ).toBeChecked();
  await expect(page.getByText(/2 nights · 2 adults, 1 child/)).toBeVisible();

  await page.getByRole("link", { name: "Change search" }).first().click();
  await expect(page).toHaveURL(/\/en\/reservar\/\?/);
  await expect(page.getByLabel("Arrival")).toHaveValue(stay.checkIn);
  await expect(page.getByLabel("Departure")).toHaveValue(stay.checkOut);
  await expect(page.getByLabel("Children")).toHaveValue("1");
  await expect(page.getByText("Preferred room: Premium double")).toBeVisible();

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/reservar\/habitacion\/\?.*plan=non_refundable/);
  await expect(page.getByRole("region", { name: "Su elección" })).toContainText(
    "Doble Premium · tarifa No reembolsable",
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/reservar\/\?/);
  await expect(page.getByLabel("Llegada")).toHaveValue(stay.checkIn);
  await expect(page.getByLabel("Niños")).toHaveValue("1");
});

test("the search form explains invalid stays before searching", async ({ page }) => {
  await page.goto("/reservar/");
  await page.getByRole("button", { name: "Ver habitaciones y precios" }).click();
  await expect(page.getByLabel("Llegada")).toBeFocused();
  await expect(page.getByText("Elija su fecha de llegada.")).toBeVisible();
  await expect(page.getByText("Elija su fecha de salida.")).toBeVisible();

  await page.getByLabel("Llegada").fill(daysFromToday(0));
  await page.getByLabel("Salida").fill(daysFromToday(62));
  await page.getByRole("button", { name: "Ver habitaciones y precios" }).click();
  await expect(page.getByText(/Las reservas en línea empiezan desde mañana/)).toBeVisible();
  await expect(page.getByText("Las estadías en línea pueden durar hasta 60 noches.")).toBeVisible();
  await expect(page).toHaveURL(/\/reservar\/$/);
});

test("the API rejects an arrival today even when the page is opened directly", async ({ page }) => {
  await page.goto(choosePath({ checkIn: daysFromToday(0), checkOut: daysFromToday(2) }));

  await expect(page.getByRole("heading", { name: "Revise su búsqueda" })).toBeFocused();
  await expect(page.getByText(/Las reservas en línea empiezan desde mañana/)).toBeVisible();
});

test("sold-out rooms are shown as sold out, not as a service failure", async ({ page }) => {
  await page.goto(choosePath(doubleSoldOutStay()));
  await expect(room(page, "Doble Premium")).toContainText("Agotada para estas fechas.");
  await expect(room(page, "Doble Premium").getByRole("radio")).toHaveCount(0);
  await expect(
    room(page, "Suite Matrimonial").getByRole("radio", { name: /Flexible/ }),
  ).toBeChecked();

  await page.goto(choosePath(allSoldOutStay(), { room: "double" }));
  await expect(page.getByText(/No hay habitaciones disponibles para estas fechas/)).toBeVisible();
  await expect(page.getByText("No pudimos consultar la disponibilidad")).toBeHidden();
});

test("a preferred room that doesn't fit is never swapped for another", async ({ page }) => {
  await page.goto(choosePath(openStay(), { adults: "3", room: "king" }));

  await expect(
    page.getByText(/Su habitación preferida, Suite Matrimonial, no está disponible/),
  ).toBeVisible();
  await expect(room(page, "Suite Matrimonial")).toContainText("admite hasta 2 adultos y 2 niños");
  await expect(room(page, "Doble Premium").getByRole("radio", { name: /Flexible/ })).toBeChecked();
  await expect(page.getByRole("region", { name: "Su elección" })).toBeHidden();
  await expect(page).not.toHaveURL(/plan=/);
});

for (const [name, fail, title] of [
  ["service failure", "abort", "No pudimos consultar la disponibilidad en este momento"],
  ["search limit", "throttle", "Demasiadas búsquedas desde su conexión"],
] as const) {
  test(`a ${name} keeps the search and can be retried`, async ({ page }) => {
    await page.route(offersRoute, (route) =>
      fail === "abort"
        ? route.abort("connectionrefused")
        : route.fulfill({
            status: 429,
            headers: { "access-control-allow-origin": "*", "retry-after": "60" },
            contentType: "application/json",
            body: JSON.stringify({ error: "too many searches" }),
          }),
    );
    await page.goto(choosePath(openStay()));

    await expect(page.getByRole("heading", { name: title })).toBeFocused();
    await expect(page.getByText("Agotada para estas fechas.")).toBeHidden();
    await expect(page.getByRole("link", { name: "Escribir por WhatsApp" }).first()).toBeVisible();

    await page.unroute(offersRoute);
    await page.getByRole("button", { name: "Intentar de nuevo" }).click();
    await expect(
      room(page, "Suite Matrimonial").getByRole("radio", { name: /Flexible/ }),
    ).toBeChecked();
  });
}
