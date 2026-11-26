import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { executeSql, localDatabase } from "../../../backend/scripts/d1.mjs";
import { pickRangeDate } from "../support/calendar";
import {
  LOCAL_API_URL,
  PUBLISHED_ROOM_TYPE_IDS,
  WEBSITE_URL,
  allSoldOutStay,
  daysFromToday,
  doubleSoldOutStay,
  openStay,
  unavailableStay,
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
const rateLinks = (card: ReturnType<typeof room>) =>
  card.getByRole("link", { name: /^Continuar con .*tarifa/ });
const tomorrowNightLink = (page: Page) =>
  page.getByRole("link", {
    name: /^(check tomorrow night|consulte la disponibilidad para mañana por la noche) \(.+\)$/,
  });

test("a room's dates button picks the stay on the rooms page and books a rate straight to review", async ({
  page,
}) => {
  const stay = openStay();
  await page.goto("/habitaciones/?room=king");

  await expect(tomorrowNightLink(page)).toHaveAttribute("href", /&room=king$/);
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Suite Matrimonial");
  const steps = page.getByRole("navigation", { name: "Pasos de la reserva" });
  await expect(steps.getByText("Habitación", { exact: true })).toBeVisible();
  await expect(steps.getByText("Tarifa", { exact: true })).toHaveCount(0);
  await expect(steps.getByText("Pago", { exact: true })).toBeVisible();
  await expect(steps.getByRole("button")).toHaveCount(0);
  await expect(steps.getByRole("link")).toHaveCount(0);
  await expect(page.locator("#stay-check-in")).toBeVisible();
  const king = room(page, "Suite Matrimonial");
  await king.getByRole("button", { name: "Elegir fechas" }).click();
  await pickRangeDate(page, stay.checkIn);
  await pickRangeDate(page, stay.checkOut);
  await page.getByRole("button", { name: "Buscar" }).click();

  await expect(page).toHaveURL(
    new RegExp(
      `/habitaciones/\\?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=1&children=0&room=king$`,
    ),
  );
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Suite Matrimonial");
  await expect(king.getByText("Desde", { exact: true })).toHaveCount(0);
  await expect(king).toContainText("Total por 2 noches");
  const family = room(page, "Suite Familiar");
  await expect(family).toContainText("Esta habitación no se puede reservar en línea");
  await expect(rateLinks(family)).toHaveCount(0);
  const contact = family.getByRole("link", { name: "WhatsApp", exact: true });
  await expect(contact).toHaveAttribute("href", /^https:\/\/wa\.me\/51992755015\?text=/);
  expect(new URL((await contact.getAttribute("href"))!).searchParams.get("text")).toContain(
    "Hola, quisiera reservar.",
  );

  const flexible = king.getByRole("link", {
    name: "Continuar con Suite Matrimonial, tarifa Flexible",
  });
  await expect(flexible).toContainText(/Flexible\s*S\/\s200\.00/);
  await expect(flexible.locator("time")).toHaveAttribute("datetime", daysFromToday(118));
  await expect(flexible).toContainText(/A pagar al reservar\s*S\/\s100\.00/);
  await expect(flexible).toContainText(/Pago en el hotel\s*S\/\s100\.00/);
  const nonRefundable = king.getByRole("link", {
    name: "Continuar con Suite Matrimonial, tarifa No reembolsable",
  });
  await expect(nonRefundable).toContainText(/No reembolsable\s*S\/\s180\.00/);
  await expect(nonRefundable).toContainText("Sin cancelación gratuita");
  await expect(nonRefundable).toContainText(/A pagar al reservar\s*S\/\s180\.00/);
  await expect(nonRefundable).not.toContainText("Pago en el hotel");
  await expect(flexible).toHaveAttribute("href", /types=king&plan=flexible&room=king$/);

  await nonRefundable.click();
  await expect(page).toHaveURL(
    new RegExp(
      `/reservar/revisar/\\?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=1&children=0&types=king&plan=non_refundable&room=king$`,
    ),
  );
});

test("the tomorrow link exposes a live search before JavaScript and a shared stay resumes through Review", async ({
  browser,
  page,
}) => {
  const stay = { checkIn: daysFromToday(240), checkOut: daysFromToday(242) };
  const tomorrow = { checkIn: daysFromToday(1), checkOut: daysFromToday(2) };
  const state = fileURLToPath(new URL("../../.local-api/state", import.meta.url));
  const db = localDatabase(state);
  const noJs = await browser.newContext({ baseURL: WEBSITE_URL, javaScriptEnabled: false });
  try {
    executeSql(
      db,
      `INSERT INTO room_type_rates (id, room_type_id, date, price_cents)
        VALUES ('room-page-override', '${PUBLISHED_ROOM_TYPE_IDS[0]}', '${stay.checkIn}', 15000);`,
    );
    const bare = await noJs.newPage();
    for (const [lang, prefix] of [
      ["es", ""],
      ["en", "/en"],
    ] as const) {
      const response = await bare.goto(`${prefix}/habitaciones/`);
      expect(response?.status()).toBe(200);
      await expect(bare.locator("html")).toHaveAttribute("lang", lang);
      await expect(bare.locator("main")).not.toContainText(/S\/\s*\d/);

      const shortcut = tomorrowNightLink(bare);
      await expect(shortcut).toHaveAttribute("href", roomsPath(tomorrow, { adults: "1" }, prefix));
      const datedUrl = new URL((await shortcut.getAttribute("href"))!, WEBSITE_URL);
      if (lang === "es") {
        await shortcut.click();
        await expect(bare.locator("#stay-check-in time")).toHaveAttribute(
          "datetime",
          tomorrow.checkIn,
        );
      }
      datedUrl.searchParams.set("checkIn", stay.checkIn);
      datedUrl.searchParams.set("checkOut", stay.checkOut);
      const dated = await bare.goto(datedUrl.href);
      await expect(tomorrowNightLink(bare)).toHaveCount(0);
      await expect(bare.getByText(/· 1 (adult|adulto)/)).toBeVisible();
      expect(dated?.headers()["cache-control"]).toContain("no-store");
      expect(dated?.headers()["cdn-cache-control"]).toBe("no-store");
      await expect(bare.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://www.hotelmanantialchurin.com${prefix}/habitaciones/`,
      );
      const flexible = bare
        .getByRole("article")
        .first()
        .getByRole("link", { name: /Flexible/ });
      await expect(flexible).toContainText(/Flexible\s*S\/\s250\.00/);
      await expect(flexible).toHaveAttribute(
        "href",
        new RegExp(`^${prefix}/reservar/revisar/\\?.*&types=king&plan=flexible$`),
      );
    }

    await bare.goto(roomsPath(doubleSoldOutStay()));
    await expect(
      room(bare, "Doble Premium").getByRole("button", { name: "Agotada" }),
    ).toBeDisabled();
    await expect(room(bare, "Suite Matrimonial")).toContainText(/S\/\s200\.00/);
    await bare.goto(roomsPath(allSoldOutStay()));
    await expect(bare.getByRole("region", { name: /Ninguna habitación/ })).toBeVisible();
    await bare.goto("/habitaciones/?checkIn=");
    await expect(bare.getByRole("heading", { name: /Revise su búsqueda/ })).toBeVisible();
    await bare.goto(roomsPath(unavailableStay()));
    await expect(bare.getByRole("heading", { name: /No pudimos consultar/ })).toBeVisible();

    const shared = roomsPath(stay, { adults: "2,1", children: "0,0", types: "king,double" });
    await bare.goto(shared);
    await expect(bare.getByRole("radio", { name: /Flexible.*S\/\s490\.00/ })).toBeVisible();

    const offerReads: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/public/offers") offerReads.push(request.url());
    });
    await page.goto(shared);
    await expect(page.locator("#stay-check-in")).toBeVisible();
    await page.getByRole("radio", { name: /Flexible/ }).check();
    await page.getByRole("complementary", { name: "Su estadía" }).getByRole("link").click();
    await expect(page).toHaveURL(/\/reservar\/revisar\/\?.*types=king%2Cdouble&plan=flexible/);
    expect(offerReads).toEqual([]);
  } finally {
    await noJs.close();
    executeSql(db, "DELETE FROM room_type_rates WHERE id = 'room-page-override';");
  }
});

test("the combined stay cancellation policy follows the selected rate", async ({ page }) => {
  await page.goto(
    roomsPath(openStay(), {
      adults: "2,1",
      children: "0,0",
      types: "king,double",
      plan: "flexible",
    }),
  );
  await expect(page.locator("#stay-check-in")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Cancelación", exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const cancellation = page.getByRole("region", { name: "Cancelación", exact: true });

  await expect(cancellation).toContainText("Tarifa Flexible");
  await expect(cancellation).toContainText("se cobra la primera noche de cada habitación");
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

test("changing dates hides the old prices and rate links until new prices arrive", async ({
  page,
}) => {
  await page.goto(roomsPath(openStay()));
  const king = room(page, "Suite Matrimonial");
  await expect(rateLinks(king)).toHaveCount(2);
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
    await expect(rateLinks(king)).toHaveCount(0);
    await expect(king).not.toContainText(/S\/\s\d/);
  } finally {
    release();
  }

  await expect(rateLinks(king)).toHaveCount(2);
  await expect(king).toContainText("Total por 3 noches");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test("sold-out rooms are shown as sold out, not as a service failure", async ({ page }) => {
  await page.goto(roomsPath(doubleSoldOutStay()));
  await expect(
    room(page, "Doble Premium").getByRole("button", { name: "Agotada", exact: true }),
  ).toBeDisabled();
  await expect(rateLinks(room(page, "Doble Premium"))).toHaveCount(0);
  await expect(rateLinks(room(page, "Suite Matrimonial"))).toHaveCount(2);

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
    await expect(rateLinks(double)).toHaveCount(0);
    await expect(double).not.toContainText(/S\/\s\d/);
  } finally {
    release();
  }
  await expect(rateLinks(room(page, "Doble Premium"))).toHaveCount(2);
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
  await expect(
    room(page, "Suite Matrimonial").getByRole("button", { name: "No admite a estos huéspedes" }),
  ).toBeDisabled();
  await expect(page.getByRole("region", { name: /Su habitación preferida/ })).toContainText(
    "Suite Matrimonial: sin capacidad para los huéspedes de esta habitación.",
  );
  await expect(rateLinks(room(page, "Doble Premium"))).toHaveCount(2);
  await expect(rateLinks(room(page, "Suite Matrimonial"))).toHaveCount(0);
  await expect(page).not.toHaveURL(/plan=/);
});
