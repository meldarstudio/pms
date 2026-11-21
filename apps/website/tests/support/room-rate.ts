import type { Page } from "@playwright/test";

export async function selectRoomRate(page: Page, room: string, plan: string) {
  await page
    .getByRole("article", { name: room })
    .getByRole("button", { name: /Ver tarifas|See rates/ })
    .click();
  await page.getByRole("radio", { name: new RegExp(plan) }).check();
}
