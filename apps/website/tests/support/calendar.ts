import type { Page } from "@playwright/test";

export async function pickRangeDate(page: Page, label: string) {
  const year = label.slice(0, 4);
  const date = new Date(`${label}T12:00:00Z`);
  const monthNames = ["es", "es-PE"].map((locale) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
      .format(date)
      .replace(/\.$/, ""),
  );
  const popup = page.getByRole("dialog");
  await popup.getByLabel("Elegir el año").first().selectOption(year);
  const months = popup.getByLabel("Elegir el mes").first();
  const option = months.getByRole("option", {
    name: new RegExp(`^(?:${monthNames.join("|")})\\.?$`, "i"),
  });
  await months.selectOption({ label: await option.innerText() });
  await popup.locator(`[data-date="${label}"]`).first().click();
}
