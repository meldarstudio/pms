import type { Page } from "@playwright/test";

export async function pickRangeDate(page: Page, label: string) {
  const [year, month] = label.split("-");
  const popup = page.getByRole("dialog");
  await popup.getByLabel("Elegir el año").first().selectOption(year!);
  await popup
    .getByLabel("Elegir el mes")
    .first()
    .selectOption(String(Number(month) - 1));
  await popup.locator(`[data-date="${label}"]`).first().click();
}
