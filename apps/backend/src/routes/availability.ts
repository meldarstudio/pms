import { availabilityQuerySchema } from "@pms/shared";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { currency, HttpError, validate } from "../http";
import { addDays } from "../lib/dates";
import { overridesFor, quoteNights, totalCents } from "../lib/quote";
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
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((type) => {
      const quoted = quoteNights(nights, type.baseRateCents, overridesFor(rates, type.id));
      return {
        id: type.id,
        name: type.name,
        maxOccupancy: type.maxOccupancy,
        free: Math.max(0, (capacity.get(type.id) ?? 0) - (occupied.get(type.id) ?? 0)),
        totalCents: totalCents(quoted),
        nights: quoted,
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
