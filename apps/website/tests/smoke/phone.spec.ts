import { expect, test } from "@playwright/test";
import { reviewPath } from "../support/checkout";
import { openStay } from "../support/local-api";
import { stubPaymentScripts, useOwnSourceIp } from "../support/payment";

test("phone country and notes survive reload and language changes", async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
  await page.setViewportSize({ width: 390, height: 1000 });
  const path = reviewPath(openStay(), { room: "king", plan: "flexible" });
  await page.goto(path);
  await expect(page.locator("#phone")).toBeVisible();
  await page.locator("[data-pay-button]").click();
  await expect(page.locator("#fullName")).toBeFocused();
  await page.locator("#fullName").fill("Ana Torres");
  await page.locator("#email").fill("ana@example.com");
  await page.locator("#phone").fill("+44 20 7946 0018");
  await expect(page.getByRole("combobox", { name: /^País y código:.*\+44/ })).toBeVisible();
  await expect(page.locator("#phone")).toHaveValue("020 7946 0018");
  await page.getByRole("combobox", { name: /^País y código:/ }).click();
  const search = page.getByRole("combobox", { name: "Buscar país" });
  await search.fill("zzzzzz");
  await expect(page.getByText("No se encontraron países.")).toBeVisible();
  await search.fill("Francia");
  await page.getByRole("option", { name: "Francia +33", exact: true }).click();
  await page.locator("#phone").fill("06");
  const note = "Llegamos alrededor de las 9 pm. Una habitación tranquila, por favor.";
  const notesToggle = page.locator('[data-reservation-notes] [data-slot="accordion-trigger"]');
  await expect(page.locator("#notes")).toBeHidden();
  await notesToggle.click();
  await page.locator("#notes").fill(note);
  await expect(page.locator("#notes")).toBeFocused();
  await notesToggle.click();
  await expect(page.locator("#notes")).toBeHidden();
  await notesToggle.click();
  await expect(page.locator("#notes")).toHaveValue(note);

  await page.reload();
  await expect(page.locator("#phone")).toHaveValue("06");
  await expect(page.locator("#notes")).toHaveValue(note);
  await expect(page.getByRole("combobox", { name: /^País y código:.*\+33/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.goto(`/en${path}`);
  await expect(page.locator("#phone")).toHaveValue("06");
  await expect(page.locator("#notes")).toHaveValue(note);
  await expect(
    page.getByRole("combobox", { name: /^Country and calling code:.*\+33/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator("#phone")).toHaveValue("06");
  await expect(page.locator("#notes")).toHaveValue(note);
});
