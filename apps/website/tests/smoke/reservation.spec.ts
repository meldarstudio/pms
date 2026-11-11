import { expect, test, type Page } from "@playwright/test";
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
  const king = room(page, "Suite Matrimonial");
  await expect(king.getByText("Su habitación preferida")).toBeVisible();
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
  await expect(king.getByText("Su habitación preferida")).toBeVisible();
  await expect(page.getByText("Cada precio es el total más bajo de la estadía.")).toHaveCount(0);
  await expect(king).toContainText("Desde");
  await expect(king).toContainText(/S\/\s180\.00/);
  await expect(king).toContainText("Total por 2 noches");
  await expect(king).toContainText("Flexible: cancelación gratis hasta el");
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
  await expect(
    page.getByText("Suite Matrimonial · 2 noches · 2 adultos", { exact: true }),
  ).toBeVisible();
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
  const summary = page.getByRole("complementary", { name: "Su estadía" });
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

for (const lang of ["", "/en"]) {
  test(`the ${lang ? "English" : "Spanish"} rate policies follow the selected rate and explain the check-in balance`, async ({
    page,
  }) => {
    const en = lang === "/en";
    await page.goto(roomsPath(openStay(), {}, lang));
    await selectRoomRate(page, en ? "King room" : "Suite Matrimonial", "Flexible");
    const policy = async (title: string) => {
      const trigger = page.getByRole("button", { name: title, exact: true });
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      return page.getByRole("region", { name: title, exact: true });
    };

    const cancellation = await policy(en ? "Cancellation" : "Cancelación");
    await expect(cancellation).toContainText(en ? "two calendar days" : "dos días calendario");
    await expect(cancellation).toContainText(en ? "Peru time" : "hora de Perú");
    await expect(cancellation).toContainText(
      en
        ? "the first night's accommodation will be charged"
        : "se cobrará el importe de la primera noche",
    );
    await expect(cancellation).not.toContainText(
      en ? "Non-refundable rate" : "Tarifa No reembolsable",
    );
    await page.getByRole("radio", { name: /No reembolsable|Non-refundable/ }).check();
    await expect(cancellation).toContainText(
      en
        ? "full payment for the stay is required when booking"
        : "el importe total de la estadía se abona al reservar",
    );
    await expect(cancellation).toContainText(en ? "No refunds" : "No se realizarán reembolsos");
    await expect(cancellation).not.toContainText(en ? "Flexible rate" : "Tarifa Flexible");
    await page.getByRole("radio", { name: /Flexible/ }).check();
    await expect(cancellation).toContainText(en ? "Flexible rate" : "Tarifa Flexible");
    await expect(cancellation).not.toContainText(
      en ? "Non-refundable rate" : "Tarifa No reembolsable",
    );

    const times = await policy(en ? "Check-in and check-out" : "Entrada y salida");
    await expect(times).toContainText(
      en ? "Check-in: From 2:00 p.m." : "Entrada (check-in): Desde las 2:00 p. m.",
    );
    await expect(times).toContainText(
      en ? "Check-out: Until 11:00 a.m." : "Salida (check-out): Hasta las 11:00 a. m.",
    );
    await expect(await policy(en ? "Breakfast" : "Desayuno")).toContainText(
      en ? "does not provide breakfast service" : "no ofrece servicio de desayuno",
    );
    const pets = await policy(en ? "Pets" : "Mascotas");
    await expect(pets).toContainText(en ? "Pets are permitted" : "Se admiten mascotas");
    await expect(pets).toContainText(
      en ? "inform us when making your reservation" : "infórmenos al realizar su reserva",
    );

    const payment = await policy(en ? "Paying at the hotel" : "Pago en el hotel");
    await expect(payment).toContainText(
      en
        ? "outstanding balance for your stay is due at check-in"
        : "saldo pendiente de su estadía, deberá abonarlo al realizar el check-in",
    );
    await expect(payment).toContainText(
      en
        ? "cash, cards, Yape and bank transfers"
        : "efectivo, tarjetas, Yape y transferencias bancarias",
    );
    await expect(payment).toContainText(
      en
        ? "does not replace the initial payment required to confirm"
        : "no sustituye el pago inicial requerido para confirmar",
    );
  });
}

test("changing the stay refreshes the rooms without leaving the page", async ({ page }) => {
  await page.goto(roomsPath(openStay()));
  await expect(
    room(page, "Suite Matrimonial").getByRole("button", { name: /Ver tarifas/ }),
  ).toBeVisible();
  await page.evaluate(() => Object.assign(window, { samePage: true }));

  await page.getByRole("button", { name: /Huéspedes/ }).click();
  await page.getByRole("button", { name: "Aumentar adultos" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Buscar" }).click();

  await expect(page).toHaveURL(/adults=3&children=0$/);
  await expect(room(page, "Suite Matrimonial")).toContainText("admite hasta 2 adultos y 2 niños");
  await selectRoomRate(page, "Doble Premium", "Flexible");
  await expect(
    page.getByRole("link", { name: "Continuar con Doble Premium, tarifa Flexible" }),
  ).toHaveAttribute("href", /adults=3&children=0&room=double&plan=flexible$/);
  expect(await page.evaluate(() => "samePage" in window)).toBe(true);
});

for (const width of [390, 1440]) {
  test(`the first date search keeps the stepper and room list in place at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/habitaciones/");
    await expect(page.getByRole("status")).toContainText("Elija sus fechas");
    await expect(page.locator("#offer-steps")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#stay-check-in").click();
    await pickRangeDate(page, openStay().checkIn);
    await pickRangeDate(page, openStay().checkOut);
    await expect(page.getByRole("dialog")).toBeHidden();

    const geometry = async () => ({
      listTop: await page
        .getByRole("article")
        .first()
        .evaluate((card) => card.getBoundingClientRect().top + scrollY),
      stepper: await page.locator("#offer-steps").evaluate((stepper) => {
        const { top, height } = stepper.getBoundingClientRect();
        return { top: top + scrollY, height };
      }),
    });
    const before = await geometry();
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
      await expect(page.getByRole("status")).toContainText("Consultando disponibilidad…");
      expect(await geometry()).toEqual(before);
      await expect(page.locator("#offer-steps")).toBeVisible();
      await expect(
        room(page, "Suite Matrimonial").getByRole("button", { name: /Ver tarifas/ }),
      ).toBeDisabled();
    } finally {
      release();
    }

    await expect(
      room(page, "Suite Matrimonial").getByRole("button", { name: /Ver tarifas/ }),
    ).toBeEnabled();
    expect(await geometry()).toEqual(before);
    await expect(page.locator("#offer-steps")).toBeVisible();
  });

  test(`changing dates keeps the room cards steady while prices refresh at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(roomsPath(openStay()));
    const king = room(page, "Suite Matrimonial");
    await expect(king.getByRole("button", { name: /Ver tarifas/ })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);

    await page.locator("#stay-check-in").click();
    await pickRangeDate(page, daysFromToday(121));
    await pickRangeDate(page, daysFromToday(124));
    await expect(page.getByRole("dialog")).toBeHidden();

    const geometry = () =>
      page.getByRole("article").evaluateAll((cards) =>
        cards.map((card) => {
          const { top, height } = card.getBoundingClientRect();
          return { top: top + window.scrollY, height };
        }),
      );
    const before = await geometry();
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
      await expect(page.getByRole("status")).toContainText("Consultando disponibilidad…");
      expect(await geometry()).toEqual(before);
      await expect(page.locator('[aria-busy="true"]')).toBeVisible();
      await expect(king.getByRole("heading", { name: "Suite Matrimonial" })).toBeVisible();
      await expect(king.getByRole("button", { name: /Ver tarifas/ })).toBeDisabled();
      await expect(king).not.toContainText(/S\/\s\d/);
    } finally {
      release();
    }

    await expect(king.getByRole("button", { name: /Ver tarifas/ })).toBeEnabled();
    await expect(king).toContainText("Total por 3 noches");
    expect(await geometry()).toEqual(before);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  });
}

test("the stay follows the guest across languages and pages", async ({ page }) => {
  const stay = openStay();
  await page.goto(roomsPath(stay, { children: "1" }));
  await expect(room(page, "Doble Premium")).toBeVisible();

  await page.locator("#lang-select").selectOption({ label: "English" });
  await expect(page).toHaveURL(
    new RegExp(`/en/habitaciones/\\?checkIn=${stay.checkIn}.*children=1$`),
  );
  await expect(page.locator("#stay-guests-value")).toHaveText("2 adults, 1 child");
  await selectRoomRate(page, "Premium double", "Non-refundable");
  await expect(
    page.getByText("Premium double · 2 nights · 2 adults, 1 child", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("label").filter({ has: page.getByRole("radio", { name: /Non-refundable/ }) }),
  ).toContainText(/S\/\s216\.00/);
  const summary = page.getByRole("complementary", { name: "Your stay" });
  await expect(summary).toContainText(/Due when booking\s*S\/\s216\.00/);
  await expect(summary).toContainText("Prices in PEN, taxes included.");
  await expect(summary.getByRole("link")).toHaveText("Continue");

  await page.goto("/churin/");
  await page.getByRole("banner").getByRole("link", { name: "Reservar", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/habitaciones/\\?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=2&children=1$`,
    ),
  );
  await expect(room(page, "Doble Premium")).toBeVisible();
});

test("kept dates that can no longer be booked online are dropped, guests are kept", async ({
  page,
}) => {
  const expired = `checkIn=${daysFromToday(0)}&checkOut=${daysFromToday(2)}&adults=3&children=0`;
  await page.addInitScript((search) => {
    sessionStorage.setItem("hm.reservation.search", JSON.stringify(search));
  }, expired);
  await page.goto("/habitaciones/");

  await expect(page.getByText("Elija sus fechas para ver precios y disponibilidad.")).toBeVisible();
  await expect(page.locator("#stay-guests-value")).toHaveText("3 adultos");
  await expect(page.locator('input[name="checkIn"]')).toHaveValue("");
  await expect(page).toHaveURL(/\/habitaciones\/$/);
});

test("a same-day arrival in the link is explained, not searched", async ({ page }) => {
  await page.goto(roomsPath({ checkIn: daysFromToday(0), checkOut: daysFromToday(2) }));
  await expect(page.getByRole("heading", { name: "Revise su búsqueda" })).toBeFocused();
  await expect(page.getByText(/Las reservas en línea empiezan desde mañana/)).toBeVisible();
});

test("sold-out rooms are shown as sold out, not as a service failure", async ({ page }) => {
  await page.goto(roomsPath(doubleSoldOutStay()));
  await expect(room(page, "Doble Premium")).toContainText("Agotada para estas fechas.");
  await expect(room(page, "Doble Premium").getByRole("link", { name: /^Reservar/ })).toHaveCount(0);
  await expect(
    room(page, "Doble Premium").getByRole("button", { name: /Ver tarifas/ }),
  ).toHaveCount(0);
  await expect(
    room(page, "Suite Matrimonial").getByRole("button", { name: /Ver tarifas/ }),
  ).toBeVisible();

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

test("a group no single room fits is told to change guests, not dates", async ({ page }) => {
  await page.goto(roomsPath(openStay(), { adults: "5" }));

  const notice = page.getByRole("region", {
    name: "Ninguna habitación se puede reservar en línea para esta búsqueda",
  });
  await expect(notice).toContainText(
    "Suite Matrimonial y Doble Premium: sin capacidad para su grupo. Cambie el número de huéspedes; las reservas en línea son para una habitación.",
  );
  await expect(notice).toContainText("Suite Familiar: sin reserva en línea.");
  await expect(notice).not.toContainText("fechas");
});

test("a preferred room that doesn't fit is never swapped for another", async ({ page }) => {
  await page.goto(roomsPath(openStay(), { adults: "3", room: "king" }));

  await expect(
    page.getByText(/Su habitación preferida, Suite Matrimonial, no está disponible/),
  ).toBeVisible();
  await expect(room(page, "Suite Matrimonial")).toContainText("admite hasta 2 adultos y 2 niños");
  await expect(
    room(page, "Suite Matrimonial").getByRole("button", { name: /Ver tarifas/ }),
  ).toHaveCount(0);
  await expect(
    room(page, "Doble Premium").getByRole("button", { name: /Ver tarifas/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Reservar / })).toHaveCount(0);
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
    await page.goto(roomsPath(openStay()));

    await expect(page.getByRole("heading", { name: title })).toBeFocused();
    await expect(page.getByText("Agotada para estas fechas.")).toBeHidden();

    await page.unroute(offersRoute);
    await page.getByRole("button", { name: "Intentar de nuevo" }).click();
    await expect(
      room(page, "Suite Matrimonial").getByRole("button", { name: /Ver tarifas/ }),
    ).toBeVisible();
  });
}
