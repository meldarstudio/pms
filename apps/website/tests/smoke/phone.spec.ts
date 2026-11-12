import { expect, test } from "@playwright/test";
import { openStay } from "../support/local-api";
import { stubPaymentScripts, useOwnSourceIp } from "../support/payment";

for (const lang of ["", "/en"]) {
  for (const width of [390, 1440]) {
    test(`phone country and notes survive reload and language changes: ${lang || "es"} ${width}`, async ({
      page,
    }) => {
      await stubPaymentScripts(page);
      await useOwnSourceIp(page, test.info().workerIndex);
      await page.setViewportSize({ width, height: 1000 });
      const params = new URLSearchParams({
        ...openStay(),
        adults: "2",
        children: "0",
        room: "king",
        plan: "flexible",
      });
      const path = `/reservar/revisar/?${params}`;
      await page.goto(`${lang}${path}`);
      const card = page.locator("section[aria-labelledby='review-contact']");
      await expect(page.locator("#phone")).toBeVisible();
      await card.screenshot({ path: test.info().outputPath("empty.png") });
      await page.locator("[data-pay-button]").click();
      await expect(page.locator("#fullName")).toBeFocused();
      await card.screenshot({ path: test.info().outputPath("errors.png") });
      await page.locator("#fullName").fill("Ana Torres");
      await page.locator("#email").fill("ana@example.com");
      await page.locator("#phone").fill("+44 20 7946 0018");
      await expect(
        page.getByRole("combobox", { name: /^(País y código|Country and calling code):.*\+44/ }),
      ).toBeVisible();
      await expect(page.locator("#phone")).toHaveValue("020 7946 0018");
      await page
        .getByRole("combobox", { name: /^(País y código|Country and calling code):/ })
        .click();
      const search = page.getByRole("combobox", { name: /^(Buscar país|Search countries)$/ });
      await search.fill("zzzzzz");
      await expect(
        page.getByText(lang ? "No countries found." : "No se encontraron países."),
      ).toBeVisible();
      await search.fill(lang ? "France" : "Francia");
      await page.screenshot({ path: test.info().outputPath("picker.png") });
      await page
        .getByRole("option", { name: lang ? "France +33" : "Francia +33", exact: true })
        .click();
      await page.locator("#phone").fill("06");
      const note = lang
        ? "Arriving around 9 pm. A quiet room, please."
        : "Llegamos alrededor de las 9 pm. Una habitación tranquila, por favor.";
      await page.locator("#notes").fill(note);
      await page.reload();
      await expect(page.locator("#phone")).toHaveValue("06");
      await expect(page.locator("#notes")).toHaveValue(note);
      await expect(
        page.getByRole("combobox", { name: /^(País y código|Country and calling code):.*\+33/ }),
      ).toBeVisible();
      await card.screenshot({ path: test.info().outputPath("filled.png") });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.goto(`${lang ? "" : "/en"}${path}`);
      await expect(page.locator("#phone")).toHaveValue("06");
      await expect(page.locator("#notes")).toHaveValue(note);
      await expect(
        page.getByRole("combobox", { name: /^(País y código|Country and calling code):.*\+33/ }),
      ).toBeVisible();
      await page.goBack();
      await expect(page.locator("#phone")).toHaveValue("06");
      await expect(page.locator("#notes")).toHaveValue(note);
    });
  }
}
