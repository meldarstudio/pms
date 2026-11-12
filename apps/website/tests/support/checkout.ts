import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { LOCAL_API_URL } from "./local-api";

export function reviewPath(
  stay: { checkIn: string; checkOut: string },
  extra: Record<string, string>,
  lang = "",
) {
  const params = new URLSearchParams({ ...stay, adults: "2", children: "0", ...extra });
  return `${lang}/reservar/revisar/?${params.toString()}`;
}

export async function checkoutToken(page: Page) {
  return page.evaluate(() => {
    const checkouts = JSON.parse(
      sessionStorage.getItem("hm.reservation.checkouts") ?? "{}",
    ) as Record<string, { token: string }>;
    return Object.values(checkouts).at(-1)!.token;
  });
}

export async function serverCheckout(page: Page, request: APIRequestContext) {
  const response = await request.get(`${LOCAL_API_URL}/public/checkout`, {
    headers: { authorization: `Bearer ${await checkoutToken(page)}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    language: string;
    quote: {
      id: string;
      expired: boolean;
      totalCents: number;
      requiredInitialPaymentCents: number;
    };
    acceptance: { quoteId: string } | null;
  };
}

export async function fillContact(page: Page, email = "ana@example.com") {
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Teléfono").fill("987 654 321");
}

export const payButton = (page: Page, amount = "[\\d.]+") =>
  page.getByRole("button", { name: new RegExp(`^(Pagar|Pay) S/\\s${amount}$`) });
