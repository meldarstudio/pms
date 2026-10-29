import { availabilityQuerySchema } from "@pms/shared";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { currency, HttpError, validate } from "../http";
import { addDays } from "../lib/dates";
import { overridesFor, priceNights, totalCents } from "../lib/pricing";
import { ratePlans } from "../lib/rate-plans";
import { roomCounts, loadRoomTypes, occupiedCounts, ratesBetween } from "../inventory";
import { requireStay } from "../rules";

export const availabilityRoutes = new Hono<Env>();

availabilityRoutes.get("/", validate("query", availabilityQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const checkOut = query.checkOut ?? addDays(query.checkIn, 1);
  const nights = requireStay(query.checkIn, checkOut);
  const db = getDb(c.env.DB);
  const types = await loadRoomTypes(db, query.roomTypeId ? [query.roomTypeId] : undefined);
  if (query.roomTypeId && types.length === 0) throw new HttpError(404, "room type not found");
  const typeIds = types.map((type) => type.id);
  const [capacity, occupied, rates] = await Promise.all([
    roomCounts(db),
    occupiedCounts(db, query.checkIn, checkOut),
    ratesBetween(db, typeIds, query.checkIn, checkOut),
  ]);
  const roomTypesOut = types
    .filter(
      (type) =>
        (query.adults === undefined || query.adults <= type.maxAdults) &&
        (query.children === undefined || query.children <= type.maxChildren),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((type) => {
      const priced = priceNights({
        dates: nights,
        baseRateCents: type.baseRateCents,
        overrides: overridesFor(rates, type.id),
        terms: ratePlans.flexible,
      });
      return {
        id: type.id,
        name: type.name,
        maxAdults: type.maxAdults,
        maxChildren: type.maxChildren,
        free: Math.max(0, (capacity.get(type.id) ?? 0) - (occupied.get(type.id) ?? 0)),
        totalCents: totalCents(priced),
        nights: priced.map(({ date, priceCents }) => ({ date, priceCents })),
      };
    });
  return c.json({
    checkIn: query.checkIn,
    checkOut,
    nights: nights.length,
    currency: currency(c),
    roomTypes: roomTypesOut,
  });
});
