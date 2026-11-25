import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { executeSql, localDatabase } from "../../../backend/scripts/d1.mjs";
import { allSoldOutStay, daysFromToday } from "../support/local-api";

const king = "935c7f23-8acc-4c78-b456-9bc588cccc2d";
const localState = fileURLToPath(new URL("../../.local-api/state", import.meta.url));
const money = (amount: string) => new RegExp(`S/\\s${amount}`);
const reference = money("100\\.00");
const liveTotal = money("250\\.00");
const overrideAmount = money("150\\.00");

const stay = {
  checkIn: daysFromToday(200),
  checkOut: daysFromToday(202),
};

function roomSection(html: string, id: string) {
  const start = html.indexOf(`id="room-${id}-name"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = html.indexOf('id="room-', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

async function pageHtml(request: APIRequestContext, path: string, headers?: Record<string, string>) {
  const response = await request.get(path, { headers });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return response.text();
}

test("room pages show reference rates and a dated search without another offer read", async ({
  page,
  request,
}) => {
  executeSql(
    localDatabase(localState),
    `INSERT INTO room_type_rates (id, room_type_id, date, price_cents)
       VALUES ('room-page-override', '${king}', '${stay.checkIn}', 15000);`,
  );
  const offerReads: string[] = [];
  page.on("request", (seen) => {
    if (new URL(seen.url()).pathname === "/public/offers") offerReads.push(seen.url());
  });

  try {
    for (const { path, canonical, referenceLabel, guide, invalid, unavailable, noMatch } of [
      {
        path: "/habitaciones/",
        canonical: "https://www.hotelmanantialchurin.com/habitaciones/",
        referenceLabel: "Tarifa de referencia",
        guide: "adults=2,1",
        invalid: "Revise su búsqueda",
        unavailable: "No pudimos consultar la disponibilidad en este momento",
        noMatch: "Ninguna habitación se puede reservar en línea para esta búsqueda",
      },
      {
        path: "/en/habitaciones/",
        canonical: "https://www.hotelmanantialchurin.com/en/habitaciones/",
        referenceLabel: "Reference rate",
        guide: "adults=2,1",
        invalid: "Check your search",
        unavailable: "We couldn't check availability right now",
        noMatch: "No room can be reserved online for this search",
      },
    ]) {
      const undated = await pageHtml(request, path);
      expect(undated).toContain(referenceLabel);
      expect(undated).toContain(guide);
      expect(undated).toContain("children=0,1");
      expect(undated).toContain('method="get"');
      expect(roomSection(undated, "king")).toMatch(reference);
      expect(roomSection(undated, "double")).toMatch(money("120\\.00"));
      expect(roomSection(undated, "family")).not.toMatch(/S\/\s\d/);
      expect(undated).not.toMatch(overrideAmount);
      for (const name of ["checkIn", "checkOut", "adults", "children"]) {
        expect(undated).toMatch(new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`));
        expect(undated).not.toMatch(
          new RegExp(`<input\\b(?=[^>]*name="${name}")(?=[^>]*disabled)[^>]*>`),
        );
      }

      const dated = await pageHtml(
        request,
        `${path}?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=1&children=0`,
      );
      expect(dated).toContain(`rel="canonical" href="${canonical}"`);
      expect(dated).toContain(stay.checkIn);
      expect(dated).toContain(stay.checkOut);
      expect(dated).toContain("Flexible");
      expect(dated).toMatch(liveTotal);
      expect(dated).toContain(referenceLabel);

      const rejected = await pageHtml(
        request,
        `${path}?checkIn=2020-01-01&checkOut=2020-01-02&adults=1&children=0`,
      );
      expect(rejected).toMatch(new RegExp(`<h2[^>]*>\\s*${invalid}\\s*</h2>`));
      expect(rejected).toContain(referenceLabel);
      expect(rejected).not.toMatch(liveTotal);

      const soldOut = allSoldOutStay();
      const unmatched = await pageHtml(
        request,
        `${path}?checkIn=${soldOut.checkIn}&checkOut=${soldOut.checkOut}&adults=1&children=0`,
      );
      expect(unmatched).toMatch(new RegExp(`<p id="rooms-notice"[^>]*>\\s*${noMatch}\\s*</p>`));
      expect(unmatched).not.toMatch(new RegExp(`<h2[^>]*>\\s*${unavailable}\\s*</h2>`));
    }

    const blocked = await pageHtml(
      request,
      `/habitaciones/?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=1&children=0`,
      { "x-pms-offer-read": "fail" },
    );
    expect(blocked).toMatch(
      /<h2[^>]*>\s*No pudimos consultar la disponibilidad en este momento\s*<\/h2>/,
    );
    expect(blocked).toContain("Tarifa de referencia");
    expect(blocked).not.toMatch(liveTotal);

    const opened = await page.goto(
      `/habitaciones/?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&adults=1&children=0`,
      { waitUntil: "networkidle" },
    );
    expect(opened?.status(), page.url()).toBe(200);
    await expect(page.getByRole("button", { name: "Buscar", exact: true })).toBeEnabled();
    expect(offerReads).toEqual([]);
  } finally {
    executeSql(
      localDatabase(localState),
      "DELETE FROM room_type_rates WHERE id = 'room-page-override';",
    );
  }
});
