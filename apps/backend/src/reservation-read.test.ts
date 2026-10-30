import type { WorkflowAction } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getDb } from "./db";
import { HttpError } from "./http";
import { loadReservation, loadReservations } from "./reservation-read";
import {
  createTestDb,
  seedReservation,
  seedRooms,
  seedRoomType,
  type TestDb,
} from "./test-support/d1";

type Saved = {
  id: string;
  rooms: { id: string }[];
  payments: { id: string }[];
  coupons: { id: string; code: string }[];
};

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101", "room-102": "102", "room-103": "103" });
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

async function book(checkIn: string, checkOut: string, rooms = 1): Promise<Saved> {
  const response = await db.request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn,
    checkOut,
    guest: { fullName: "Ada Lovelace" },
    rooms: Array.from({ length: rooms }, () => ({ roomTypeId: "type", adults: 1, children: 0 })),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Saved>;
}

async function command(id: string, actions: WorkflowAction[]): Promise<Saved> {
  const response = await db.request(`/reservations/${id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body as Saved;
}

const pay = (amountCents: number): WorkflowAction => ({
  type: "add-payment",
  payment: { amountCents, method: "cash", paymentDate: "2026-10-10" },
});

async function couponIssuer() {
  const stay = await book("2026-10-20", "2026-10-22");
  const paid = await command(stay.id, [pay(20000), { type: "set-status", status: "cancelled" }]);
  return command(paid.id, [{ type: "issue-coupon", amountCents: 15000, guestAccepted: true }]);
}

async function redeemer(code: string) {
  const stay = await book("2026-11-01", "2026-11-03");
  return command(stay.id, [{ type: "redeem-coupon", code, amountCents: 5000 }]);
}

function seedFillers(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const id = `filler-${String(i).padStart(3, "0")}`;
    seedReservation(db.sqlite, {
      id,
      code: `F${String(i).padStart(5, "0")}`,
      guestName: `Filler ${i}`,
      checkIn: "2026-10-25",
      checkOut: "2026-10-27",
      createdAt: "2026-10-10",
      status: "cancelled",
      nightCents: 9000,
    });
    return id;
  });
}

const loadEach = (ids: string[]) =>
  Promise.all(ids.map((id) => loadReservation(getDb(db.env.DB), id)));

describe("loading reservations", () => {
  it("loads many reservations in the requested order exactly as it loads each one", async () => {
    const issuer = await couponIssuer();
    await command(issuer.id, [
      {
        type: "request-refund",
        paymentId: issuer.payments[0].id,
        amountCents: 1000,
        method: "cash",
        reason: "Change of plans",
      },
    ]);
    const funded = await redeemer(issuer.coupons[0].code);
    const family = await book("2026-10-12", "2026-10-14", 2);
    await command(family.id, [
      pay(5000),
      {
        type: "set-guests",
        guests: [
          {
            id: crypto.randomUUID(),
            fullName: "Grace Hopper",
            email: null,
            phone: null,
            reservationRoomId: family.rooms[1].id,
          },
        ],
      },
    ]);
    const ids = [family.id, funded.id, issuer.id];

    const states = await loadReservations(getDb(db.env.DB), ids);

    expect(states).toEqual(await loadEach(ids));
    expect(states.map((state) => state.reservation.id)).toEqual(ids);
    expect(states[0]).toMatchObject({
      lines: [{ nights: [{}, {}] }, { nights: [{}, {}] }],
      stayingGuests: [{ fullName: "Grace Hopper" }],
      payments: [{ amountCents: 5000 }],
    });
    expect(states[2]).toMatchObject({
      cancellations: [{ outcome: "cancelled" }],
      refunds: [{ amountCents: 1000, status: "requested" }],
      couponMovements: [{ kind: "issue", amountCents: 15000 }],
    });
  });

  it("loads more reservations than one batch holds, sharing a coupon across batches once each", async () => {
    const issuer = await couponIssuer();
    const nearby = await redeemer(issuer.coupons[0].code);
    const fillers = seedFillers(110);
    const distant = await redeemer(issuer.coupons[0].code);
    const ids = [issuer.id, nearby.id, ...fillers, distant.id];

    const states = await loadReservations(getDb(db.env.DB), ids);

    expect(states).toHaveLength(113);
    expect(states).toEqual(await loadEach(ids));
    for (const state of [states[0], states[1], states[112]])
      expect(state.coupons).toEqual([
        expect.objectContaining({ id: issuer.coupons[0].id, balanceCents: 5000 }),
      ]);
    expect(states[50]).toMatchObject({ reservation: { id: fillers[48] }, coupons: [] });
    expect(states[112].lines[0].nights).toHaveLength(2);
  });

  it.each([
    { name: "a missing reservation", ids: ["missing"], message: "reservation not found" },
    {
      name: "one missing among many",
      ids: ["filler-000", "missing"],
      message: "reservation not found",
    },
    {
      name: "a reservation without its booking contact",
      ids: ["orphan"],
      message: "guest not found",
    },
  ])("rejects $name with a 404", async ({ ids, message }) => {
    seedFillers(1);
    db.sqlite.exec("PRAGMA foreign_keys = OFF");
    db.sqlite.exec(
      "INSERT INTO reservations (id, code, status, guest_id, check_in, check_out, created_at) VALUES ('orphan', 'ORPHAN', 'confirmed', 'gone', '2026-10-25', '2026-10-26', '2026-10-10')",
    );
    db.sqlite.exec("PRAGMA foreign_keys = ON");

    const loading = loadReservations(getDb(db.env.DB), ids);

    await expect(loading).rejects.toBeInstanceOf(HttpError);
    await expect(loading).rejects.toMatchObject({ status: 404, message });
  });
});
