import type { Page } from "@playwright/test";
import { expect, test } from "../support/browser-errors";
import { pickRangeDate } from "../support/calendar";
import { selectRoomRate } from "../support/room-rate";
import {
  LOCAL_API_URL,
  allSoldOutStay,
  daysFromToday,
  doubleSoldOutStay,
  openStay,
} from "../support/local-api";

const offersRoute = `${LOCAL_API_URL}/public/offers*`;

function roomsPath(
  stay: { checkIn: string; checkOut: string },
  extra: Record<string, string> = {},
  lang = "",
) {
  const params = new URLSearchParams({ ...stay, adults: "2", children: "0", ...extra });
  return `${lang}/habitaciones/?${params.toString()}`;
}

const room = (page: Page, name: string) => page.getByRole("article", { name });

test("a room's dates button picks the stay on the rooms page and books a rate straight to review", async ({
  page,
}) => {
  const stay = openStay();
  await page.goto("/habitaciones/?room=king");

  await expect(page.getByText("Elija sus fechas para ver precios y disponibilidad.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Suite Matrimonial");
  const steps = page.getByRole("navigation", { name: "Pasos de la reserva" });
  await expect(steps.getByText("Habitación", { exact: true })).toBeVisible();
  await expect(steps.getByText("Tarifa", { exact: true })).toBeVisible();
  await expect(steps.getByText("Pago", { exact: true })).toBeVisible();
  await expect(steps.getByRole("button")).toHaveCount(0);
  await expect(steps.getByRole("link")).toHaveCount(0);
  const king = room(page, "Suite Matrimonial");
  await expect(page.getByRole("main")).not.toContainText(/S\/\s\d/);
  await king.getByRole("button", { name: "Elegir fechas" }).click();
  await pickRangeDate(page, stay.checkIn);
  await pickRangeDate(page, stay.checkOut);
  await page.getByRole("button", { name: "Buscar" }).click();

  await expect(page).toHaveURL(
    new RegExp(
      `/habitaciones/\\?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=2&children=0&room=king$`,
    ),
  );
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Suite Matrimonial");
  await expect(page.getByText("Cada precio es el total más bajo de la estadía.")).toHaveCount(0);
  await expect(king).toContainText("Desde");
  await expect(king).toContainText(/S\/\s180\.00/);
  await expect(king).toContainText("Total por 2 noches");
  await expect(king).not.toContainText("cancelación");
  await expect(king.getByRole("heading", { name: "Flexible" })).toHaveCount(0);
  const family = room(page, "Suite Familiar");
  await expect(family).toContainText("Esta habitación no se puede reservar en línea");
  await expect(family.getByRole("link", { name: /^Reservar/ })).toHaveCount(0);
  await expect(family.getByRole("button", { name: /Ver tarifas/ })).toHaveCount(0);
  const contact = family.getByRole("link", { name: "WhatsApp", exact: true });
  await expect(contact).toHaveAttribute("href", /^https:\/\/wa\.me\/51992755015\?text=/);
  expect(new URL((await contact.getAttribute("href"))!).searchParams.get("text")).toContain(
    "Hola, quisiera reservar.",
  );

  await room(page, "Suite Matrimonial")
    .getByRole("button", { name: /Ver tarifas/ })
    .click();
  const flexible = page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: /Flexible/ }) });
  const summary = page.getByRole("complementary", { name: "Su estadía" });
  await expect(summary).toContainText("Suite Matrimonial");
  await expect(summary).toContainText("2 noches");
  await expect(summary).toContainText("2 adultos");
  await expect(flexible).toContainText(/S\/\s200\.00/);
  await expect(flexible).toContainText("Cancelación gratuita hasta el ");
  await expect(flexible.locator("time")).toHaveAttribute("datetime", daysFromToday(118));
  await expect(flexible).toContainText(/A pagar al reservar\s*S\/\s100\.00/);
  await expect(flexible).toContainText(/Pago en el hotel\s*S\/\s100\.00/);
  const nonRefundable = page.locator("label").filter({
    has: page.getByRole("radio", { name: /No reembolsable/ }),
  });
  await expect(nonRefundable).toContainText(/S\/\s180\.00/);
  await expect(nonRefundable).toContainText(/Sin cancelación gratuita · Ahorre S\/\s20\.00/);
  await expect(nonRefundable).toContainText(/A pagar al reservar\s*S\/\s180\.00/);
  await expect(nonRefundable).not.toContainText("Pago en el hotel");
  await expect(page.getByRole("radio", { name: /No reembolsable/ })).toBeChecked();
  await expect(summary).toContainText("Precios en PEN, impuestos incluidos.");
  await expect(summary.getByRole("link")).toHaveText("Continuar");
  await page.getByRole("radio", { name: /Flexible/ }).check();
  await expect(summary).toContainText(/Total de la estadía\s*S\/\s200\.00/);
  await expect(summary).toContainText(/A pagar al reservar\s*S\/\s100\.00/);
  await expect(summary).toContainText(/Pago en el hotel\s*S\/\s100\.00/);
  await expect(summary.getByRole("link")).toHaveAttribute("href", /plan=flexible$/);
  await page.getByRole("radio", { name: /No reembolsable/ }).check();
  await expect(summary).toContainText(/A pagar al reservar\s*S\/\s180\.00/);
  await expect(summary).not.toContainText("Pago en el hotel");

  await page
    .getByRole("link", { name: "Continuar con Suite Matrimonial, tarifa No reembolsable" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/reservar/revisar/\\?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=2&children=0&room=king&plan=non_refundable$`,
    ),
  );
});

test("the cancellation policy follows the selected rate", async ({ page }) => {
  await page.goto(roomsPath(openStay()));
  await selectRoomRate(page, "Suite Matrimonial", "Flexible");
  const trigger = page.getByRole("button", { name: "Cancelación", exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const cancellation = page.getByRole("region", { name: "Cancelación", exact: true });

  await expect(cancellation).toContainText("Tarifa Flexible");
  await expect(cancellation).toContainText("se cobrará el importe de la primera noche");
  await expect(cancellation).not.toContainText("Tarifa No reembolsable");
  await page.getByRole("radio", { name: /No reembolsable/ }).check();
  await expect(cancellation).toContainText("el importe total de la estadía se abona al reservar");
  await expect(cancellation).toContainText(
    "no se devuelve lo pagado, salvo que el hotel no pueda prestar el servicio",
  );
  await expect(cancellation).not.toContainText("Tarifa Flexible");
  await page.getByRole("radio", { name: /Flexible/ }).check();
  await expect(cancellation).toContainText("Tarifa Flexible");
  await expect(cancellation).not.toContainText("Tarifa No reembolsable");
});

test("changing dates hides the old prices and disables Ver tarifas until new prices arrive", async ({
  page,
}) => {
  await page.goto(roomsPath(openStay()));
  const king = room(page, "Suite Matrimonial");
  await expect(king.getByRole("button", { name: /Ver tarifas/ })).toBeEnabled();
  await expect(king).toContainText("Total por 2 noches");

  await page.locator("#stay-check-in").click();
  await pickRangeDate(page, daysFromToday(121));
  await pickRangeDate(page, daysFromToday(124));
  await expect(page.getByRole("dialog")).toBeHidden();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(offersRoute, async (route) => {
    await pending;
    await route.continue();
  });

  try {
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.locator("[data-search-status]")).toContainText("Consultando disponibilidad…");
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expect(king.getByRole("heading", { name: "Suite Matrimonial" })).toBeVisible();
    await expect(king.getByRole("button", { name: /Ver tarifas/ })).toBeDisabled();
    await expect(king).not.toContainText(/S\/\s\d/);
  } finally {
    release();
  }

  await expect(king.getByRole("button", { name: /Ver tarifas/ })).toBeEnabled();
  await expect(king).toContainText("Total por 3 noches");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test("sold-out rooms are shown as sold out, not as a service failure", async ({ page }) => {
  await page.goto(roomsPath(doubleSoldOutStay()));
  await expect(
    room(page, "Doble Premium").getByRole("button", { name: "Agotada", exact: true }),
  ).toBeDisabled();
  await expect(room(page, "Doble Premium").getByRole("link", { name: /^Reservar/ })).toHaveCount(0);
  await expect(
    room(page, "Doble Premium").getByRole("button", { name: /Ver tarifas/ }),
  ).toHaveCount(0);
  await expect(
    room(page, "Suite Matrimonial").getByRole("button", { name: /Ver tarifas/ }),
  ).toBeVisible();

  await page.locator("#stay-check-in").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const availableStay = openStay();
  await pickRangeDate(page, availableStay.checkIn);
  await pickRangeDate(page, availableStay.checkOut);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(offersRoute, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.locator("[data-search-status]")).toContainText("Consultando disponibilidad");
    const double = room(page, "Doble Premium");
    await expect(double).not.toContainText("Agotada");
    await expect(double.getByRole("button", { name: "Ver tarifas" })).toBeDisabled();
    await expect(double).not.toContainText(/S\/\s\d/);
  } finally {
    release();
  }
  await expect(
    room(page, "Doble Premium").getByRole("button", { name: "Ver tarifas" }),
  ).toBeVisible();
  await expect(room(page, "Doble Premium")).not.toContainText("Agotada");

  await page.goto(roomsPath(allSoldOutStay(), { room: "double" }));
  const notice = page.getByRole("region", {
    name: "Ninguna habitación se puede reservar en línea para esta búsqueda",
  });
  await expect(notice).toContainText(
    "Suite Matrimonial y Doble Premium: sin disponibilidad para estas fechas. Pruebe otras fechas.",
  );
  await expect(notice).toContainText(
    "Suite Familiar: sin reserva en línea. Escríbanos por WhatsApp para reservar.",
  );
  await expect(notice).not.toContainText("huéspedes");
  await expect(page.getByText("No pudimos consultar la disponibilidad")).toBeHidden();
});

test("a preferred room that doesn't fit is never swapped for another", async ({ page }) => {
  await page.goto(roomsPath(openStay(), { adults: "3", room: "king" }));

  await expect(
    page.getByText(/Su habitación preferida, Suite Matrimonial, no está disponible/),
  ).toBeVisible();
  await expect(room(page, "Suite Matrimonial")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Su habitación preferida/ })).toContainText(
    "Suite Matrimonial: sin capacidad para su grupo.",
  );
  await expect(
    room(page, "Doble Premium").getByRole("button", { name: /Ver tarifas/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Reservar / })).toHaveCount(0);
  await expect(page).not.toHaveURL(/plan=/);
});
