import { readFileSync } from "node:fs";

const roomSeed = readFileSync(new URL("../seed.sql", import.meta.url), "utf8");

export function referenceDate(value = new Date().toISOString().slice(0, 10)) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Date must be a valid UTC calendar date in YYYY-MM-DD format");
  }
  return value;
}

const examples = [
  {
    id: "departed",
    name: ["Valeria", "Rojas"],
    arrival: -8,
    nights: 3,
    status: "checked_out",
    payment: "deposit",
    method: "cash",
    rooms: [{ type: "suite-matrimonial", room: "102", adults: 2 }],
  },
  {
    id: "in-house",
    name: ["Diego", "Salazar"],
    arrival: -2,
    nights: 4,
    status: "checked_in",
    payment: "deposit",
    rooms: [{ type: "suite-matrimonial", room: "102", adults: 2, discountCents: 2000 }],
  },
  {
    id: "turnover",
    name: ["Mateo", "Flores"],
    arrival: 2,
    nights: 3,
    payment: "deposit",
    rooms: [{ type: "suite-matrimonial", room: "102", adults: 1 }],
  },
  {
    id: "arrival",
    name: ["Camila", "O'Brien"],
    arrival: 0,
    nights: 3,
    rooms: [{ type: "suite-matrimonial", room: "103", adults: 2, discountCents: 1500 }],
  },
  {
    id: "upcoming",
    name: ["Lucía", "Torres"],
    arrival: 4,
    nights: 4,
    payment: "deposit",
    rooms: [{ type: "suite-matrimonial", room: "104", adults: 1 }],
  },
  {
    id: "alex",
    name: ["Alejandro", "Demo"],
    arrival: 0,
    nights: 1,
    rooms: [{ type: "suite-matrimonial", adults: 1 }],
  },
  {
    id: "sam",
    name: ["Sofía", "Demo"],
    arrival: 1,
    nights: 3,
    rooms: [{ type: "doble-premium", adults: 2 }],
  },
  {
    id: "jamie",
    name: ["Javier", "Demo"],
    arrival: 0,
    nights: 9,
    payment: "deposit",
    rooms: [
      { type: "suite-matrimonial", adults: 2, discountCents: 9000 },
      { type: "suite-familiar", adults: 2, children: 2, discountCents: 12000 },
    ],
  },
  {
    id: "cancelled",
    name: ["Daniela", "Vargas"],
    arrival: 3,
    nights: 2,
    status: "cancelled",
    payment: "deposit",
    rooms: [{ type: "doble-premium", adults: 2, discountCents: 4000 }],
  },
  {
    id: "staff-cancelled",
    name: ["Sebastián", "Castro"],
    arrival: -1,
    nights: 2,
    status: "cancelled",
    rooms: [{ type: "suite-matrimonial", adults: 1 }],
  },
  {
    id: "family",
    name: ["Mariana", "García"],
    arrival: 0,
    nights: 4,
    payment: "full",
    rooms: [{ type: "suite-familiar", room: "306", adults: 2, children: 2, discountCents: 10000 }],
  },
  {
    id: "group",
    name: ["Andrés", "Quispe"],
    arrival: 2,
    nights: 3,
    payment: "deposit",
    rooms: [
      { type: "doble-premium", room: "108", adults: 2, discountCents: 3000 },
      { type: "doble-premium", room: "201", adults: 2, children: 1, discountCents: 5000 },
    ],
  },
  {
    id: "long-stay",
    name: ["Renato", "Díaz"],
    arrival: -3,
    nights: 10,
    status: "checked_in",
    payment: "deposit",
    rooms: [
      {
        type: "suite-matrimonial",
        room: "106",
        adults: 1,
        flatRateCents: 9500,
        discountCents: 4500,
      },
    ],
  },
  {
    id: "next-week",
    name: ["Paola", "Mendoza"],
    arrival: 7,
    nights: 4,
    rooms: [{ type: "suite-matrimonial", room: "107", adults: 2 }],
  },
  {
    id: "suite",
    name: ["Gabriela", "Luna"],
    arrival: 2,
    nights: 3,
    payment: "full",
    rooms: [{ type: "suite-familiar", room: "309", adults: 2 }],
  },
  {
    id: "departure",
    name: ["Bruno", "Chávez"],
    arrival: -3,
    nights: 3,
    status: "checked_in",
    payment: "full",
    method: "other",
    rooms: [{ type: "doble-premium", room: "204", adults: 2 }],
  },
  {
    id: "early-departure",
    name: ["Elena", "Paredes"],
    arrival: -1,
    nights: 1,
    status: "checked_out",
    payment: "credit",
    rooms: [{ type: "suite-matrimonial", room: "202", adults: 1, discountCents: 2500 }],
  },
  {
    id: "reused-room",
    name: ["Rodrigo", "Soto"],
    arrival: 0,
    nights: 2,
    rooms: [{ type: "suite-matrimonial", room: "202", adults: 2 }],
  },
  {
    id: "split-departure",
    status: "checked_in",
    name: ["Carolina", "Huamán"],
    arrival: -1,
    nights: 3,
    payment: "deposit",
    rooms: [
      {
        type: "suite-matrimonial",
        room: "203",
        adults: 1,
        discountCents: 1000,
      },
      { type: "suite-matrimonial", room: "206", adults: 2, discountCents: 3000 },
    ],
  },
  {
    id: "discount",
    name: ["Ana", "Gutiérrez"],
    arrival: 1,
    nights: 2,
    rooms: [{ type: "suite-matrimonial", room: "105", adults: 1, fullDiscount: true }],
  },
  {
    id: "installments",
    name: ["Luis", "Pérez"],
    arrival: 0,
    nights: 3,
    status: "checked_in",
    payment: "installments",
    rooms: [{ type: "doble-premium", room: "205", adults: 2, discountCents: 5000 }],
  },
  {
    id: "no-show",
    name: ["Martín", "Ríos"],
    arrival: 0,
    nights: 2,
    status: "no_show",
    payments: [{ amount: "first-night", method: "yape" }],
    cancellation: { recorded: 0 },
    rooms: [{ type: "doble-premium", room: "207", adults: 2 }],
  },
  {
    id: "no-show-rebooked",
    name: ["Fiorella", "Campos"],
    arrival: 0,
    nights: 2,
    status: "no_show",
    payments: [{ amount: "first-night", method: "card" }],
    cancellation: { recorded: 0 },
    rooms: [{ type: "doble-premium", room: "208", adults: 2 }],
  },
  {
    id: "rebooked-room",
    name: ["Gonzalo", "Herrera"],
    arrival: 0,
    nights: 2,
    payment: "deposit",
    rooms: [{ type: "doble-premium", room: "208", adults: 1 }],
  },
  {
    id: "no-show-waived",
    name: ["Ximena", "Aguilar"],
    arrival: -1,
    nights: 3,
    status: "no_show",
    plan: "non_refundable",
    payments: [{ amount: "total", method: "transfer" }],
    cancellation: {
      recorded: -1,
      waivers: [{ amountCents: 15000, reason: "Vuelo cancelado; se acordó devolver una noche." }],
    },
    refunds: [{ amountCents: 15000, method: "transfer", status: "requested" }],
    rooms: [{ type: "suite-matrimonial", room: "210", adults: 1 }],
  },
  {
    id: "no-show-unpaid",
    name: ["Joaquín", "Ñahui"],
    guest: { email: null, phone: null, documentType: null, documentNumber: null, notes: null },
    arrival: -2,
    nights: 2,
    status: "no_show",
    cancellation: { recorded: -2 },
    rooms: [{ type: "suite-matrimonial", adults: 1 }],
  },
  {
    id: "cancel-free",
    name: ["Lorena", "Bustamante"],
    arrival: 10,
    nights: 3,
    status: "cancelled",
    reason: "El huésped cambió de fechas.",
    payments: [{ amount: "first-night", method: "transfer" }],
    cancellation: { recorded: 0, chargeCents: 0, freeUntil: 8 },
    refunds: [{ amount: "first-night", method: "transfer", status: "requested" }],
    rooms: [{ type: "suite-matrimonial", adults: 2 }],
  },
  {
    id: "cancel-late-waived",
    name: ["Hugo", "Tapia"],
    arrival: 1,
    nights: 2,
    status: "cancelled",
    reason: "Emergencia familiar.",
    payments: [{ amount: "first-night", method: "cash" }],
    cancellation: {
      recorded: 0,
      freeUntil: -1,
      waivers: [{ amountCents: 5000, reason: "Cliente frecuente." }],
    },
    refunds: [{ amountCents: 5000, method: "cash", status: "completed", reference: "CAJA-12" }],
    rooms: [{ type: "doble-premium", adults: 2 }],
  },
  {
    id: "cancel-refund-failed",
    name: ["Inés", "Valdivia"],
    arrival: 12,
    nights: 2,
    status: "cancelled",
    payments: [{ amount: "first-night", method: "card" }],
    cancellation: { recorded: -1, chargeCents: 0, freeUntil: 10 },
    refunds: [
      {
        amount: "first-night",
        method: "card",
        status: "failed",
        failure: "La tarjeta del huésped está vencida.",
      },
    ],
    rooms: [{ type: "doble-premium", adults: 1, children: 2 }],
  },
  {
    id: "cancel-coupon",
    name: ["Óscar", "Benavides"],
    arrival: 6,
    nights: 2,
    status: "cancelled",
    reason: "Prefiere volver en otra fecha.",
    payments: [{ amount: "total", method: "plin" }],
    cancellation: { recorded: -3, chargeCents: 0, freeUntil: 4 },
    coupon: { code: "DEMOVALE2026", issued: -3, redeemCents: 10000, redeemedBy: "coupon-redeemer" },
    rooms: [{ type: "suite-matrimonial", adults: 2 }],
  },
  {
    id: "coupon-redeemer",
    name: ["Teresa", "Cáceres"],
    arrival: 14,
    nights: 2,
    rooms: [{ type: "suite-matrimonial", adults: 1 }],
  },
  {
    id: "coupon-expired",
    name: ["Ricardo", "Palacios"],
    arrival: -400,
    nights: 2,
    created: -420,
    status: "cancelled",
    payments: [{ amount: "first-night", method: "cash", day: -410 }],
    cancellation: { recorded: -403, chargeCents: 0, freeUntil: -402 },
    coupon: { code: "DEMOVENCIDO", issued: -403 },
    rooms: [{ type: "suite-matrimonial", adults: 1 }],
  },
  {
    id: "restored",
    name: ["Natalia", "Morales"],
    arrival: 5,
    nights: 3,
    payments: [{ amount: "first-night", method: "card" }],
    cancellation: {
      recorded: -2,
      restored: -1,
      freeUntil: 3,
      chargeCents: 0,
    },
    rooms: [{ type: "suite-matrimonial", room: "211", adults: 2 }],
  },
  {
    id: "unfulfilled",
    name: ["Emma", "Wilson"],
    source: "online",
    arrival: 2,
    nights: 2,
    status: "unfulfilled",
    plan: "non_refundable",
    payments: [{ amount: "total", method: "card", culqi: "chr_test_demo_unfulfilled" }],
    rooms: [{ type: "suite-familiar", adults: 2, children: 1 }],
  },
  {
    id: "online-prepaid",
    name: ["Lucas", "Fernández"],
    source: "online",
    arrival: 3,
    nights: 2,
    plan: "non_refundable",
    payments: [{ amount: "total", method: "card", culqi: "chr_test_demo_prepaid" }],
    rooms: [{ type: "doble-premium", adults: 1, children: 2 }],
  },
  {
    id: "overdue-arrival",
    name: ["Silvia", "Ponce"],
    arrival: -1,
    nights: 3,
    payment: "deposit",
    rooms: [{ type: "suite-matrimonial", room: "104", adults: 2 }],
  },
  {
    id: "overdue-departure",
    name: ["Felipe", "Arana"],
    arrival: -3,
    nights: 2,
    status: "checked_in",
    payment: "deposit",
    rooms: [{ type: "doble-premium", room: "208", adults: 2 }],
  },
  {
    id: "in-house-unassigned",
    name: ["Daniel", "Cueva"],
    arrival: -1,
    nights: 2,
    status: "checked_in",
    payment: "full",
    rooms: [{ type: "doble-premium", adults: 3 }],
  },
  {
    id: "departed-unpaid",
    name: ["Pilar", "Gamarra"],
    arrival: -6,
    nights: 3,
    status: "checked_out",
    rooms: [{ type: "suite-matrimonial", room: "211", adults: 1 }],
  },
  {
    id: "max-stay",
    name: ["María de los Ángeles", "Fernández-Villanueva de la Torre y Santisteban"],
    guest: { email: null, notes: "Estadía corporativa de 60 noches, el máximo permitido." },
    arrival: 20,
    nights: 60,
    payment: "deposit",
    rooms: [{ type: "suite-matrimonial", adults: 1 }],
  },
];

const dirtyRooms = ["202", "204", "208"];

const stayingGuests = {
  "in-house": [
    { name: "Diego Salazar", document: "45678912" },
    { name: "Renata Salazar", document: null },
  ],
  family: [{ name: "Mariana García", document: "70112233" }],
};

const inventoryStatuses = ["confirmed", "checked_in", "checked_out"];
const holdsInventory = (status = "confirmed") => inventoryStatuses.includes(status);

const closures = [
  { room: "209", starts: -1, ends: 3, reason: "Reparación del baño" },
  { room: "301", starts: 4, ends: 7, reason: "Mantenimiento del aire acondicionado" },
  { room: "409", starts: 1, ends: 4, reason: "Cambio de alfombra" },
];

function busyExamples() {
  const inventory = Array.from(
    roomSeed.matchAll(/\('room-([^']+)', '[^']+', 'type-([^']+)'\)/g),
    ([, number, type]) => ({ number, type, blocked: new Set() }),
  );
  const occupied = new Map();
  const nights = (arrival, length) => Array.from({ length }, (_, index) => arrival + index);
  const isFree = (room, arrival, length) =>
    nights(arrival, length).every((day) => !room.blocked.has(day));
  function reserve(room, arrival, length) {
    for (const day of nights(arrival, length)) {
      room.blocked.add(day);
      occupied.set(day, (occupied.get(day) ?? 0) + 1);
    }
  }
  function target(day) {
    const closed = closures.filter(({ starts, ends }) => starts <= day && day < ends).length;
    return Math.round((inventory.length - closed) * 0.85);
  }
  for (const closure of closures) {
    const room = inventory.find(({ number }) => number === closure.room);
    for (const day of nights(closure.starts, closure.ends - closure.starts)) room.blocked.add(day);
  }
  for (const assigned of [true, false]) {
    for (const example of examples.filter(({ status }) => holdsInventory(status))) {
      for (const room of example.rooms.filter(({ room }) => Boolean(room) === assigned)) {
        const available = inventory.find(
          (candidate) =>
            candidate.type === room.type &&
            (!assigned || candidate.number === room.room) &&
            isFree(candidate, example.arrival, example.nights),
        );
        if (!available) throw new Error(`No seed inventory for ${example.id}`);
        reserve(available, example.arrival, example.nights);
      }
    }
  }

  const firstNames = [
    "Adriana",
    "Alejandro",
    "Ana Lucía",
    "Andrés",
    "Beatriz",
    "Camila",
    "Carlos",
    "Carmen",
    "Claudia",
    "Daniel",
    "Elena",
    "Fernando",
    "Gabriela",
    "Héctor",
    "Isabel",
    "Jorge",
    "Karina",
    "Luis",
    "María José",
    "Nicolás",
    "Patricia",
    "Raúl",
    "Rosa",
    "Valentina",
  ];
  const lastNames = [
    "Mendoza",
    "Quispe",
    "Torres",
    "Villanueva",
    "Salazar",
    "Huamán",
    "Paredes",
    "Rojas",
    "Gutiérrez",
    "Flores",
    "Castillo",
    "Ramos",
    "Soto",
    "Vargas",
    "Chávez",
    "Cárdenas",
    "Díaz",
    "Espinoza",
    "García",
    "López",
    "Medina",
    "O'Brien",
    "Pérez",
    "Vásquez",
    "Zúñiga",
  ];
  const generated = [];
  for (let day = -45; day < 45; day++) {
    while ((occupied.get(day) ?? 0) < target(day)) {
      const index = generated.length;
      const start = index % inventory.length;
      const room = [...inventory.slice(start), ...inventory.slice(0, start)].find((candidate) =>
        isFree(candidate, day, 1),
      );
      if (!room) throw new Error(`No seed inventory on day ${day}`);
      let length = 1 + (index % 4);
      while (
        !isFree(room, day, length) ||
        nights(day, length).some(
          (night) => night >= 45 || (occupied.get(night) ?? 0) >= target(night),
        )
      )
        length--;
      reserve(room, day, length);
      generated.push({
        id: `busy-${index + 1}`,
        name: [
          firstNames[index % firstNames.length],
          lastNames[Math.floor(index / firstNames.length) % lastNames.length],
        ],
        arrival: day,
        nights: length,
        status:
          day + length <= 0
            ? "checked_out"
            : day < 0 || (day === 0 && index % 4 === 0)
              ? "checked_in"
              : "confirmed",
        payment: [undefined, "deposit", "full", "credit", "installments"][index % 5],
        rooms: [
          {
            type: room.type,
            room: day >= 0 && index % 9 === 0 ? undefined : room.number,
            adults: 1 + (index % 2),
            children: index % 5 === 0 ? 1 : 0,
            discountCents: index % 7 === 0 ? 2500 : 0,
          },
        ],
      });
    }
  }
  return [...examples, ...generated];
}

const ratePlans = {
  flexible: {
    plan: "flexible",
    chargeBasis: "first_night",
    freeDays: 2,
    paymentSchedule: "first_night_deposit",
    adjustmentPercent: 0,
  },
  non_refundable: {
    plan: "non_refundable",
    chargeBasis: "final_total",
    freeDays: null,
    paymentSchedule: "full_upfront",
    adjustmentPercent: -10,
  },
};

function guestOverrides(guest = {}) {
  const columns = {
    email: "email",
    phone: "phone",
    documentType: "document_type",
    documentNumber: "document_number",
    notes: "notes",
  };
  return Object.fromEntries(Object.entries(guest).map(([key, value]) => [columns[key], value]));
}

function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function insert(table, row) {
  return `INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(literal).join(", ")});`;
}

export function buildResetSql(value) {
  const anchor = referenceDate(value);
  function date(offset) {
    const result = new Date(`${anchor}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + offset);
    const formatted = result.toISOString().slice(0, 10);
    return referenceDate(formatted);
  }

  const createdAt = `${date(-60)}T12:00:00.000Z`;
  const statements = [
    "DELETE FROM reservation_requests;",
    "DELETE FROM coupon_movements;",
    "DELETE FROM coupons;",
    "DELETE FROM reservation_guests;",
    "DELETE FROM reservation_room_nights;",
    "DELETE FROM refunds;",
    "DELETE FROM cancellation_waivers;",
    "DELETE FROM reservation_cancellations;",
    "DELETE FROM payment_attempts;",
    "DELETE FROM payments;",
    "DELETE FROM reservation_rooms;",
    "DELETE FROM reservations;",
    "DELETE FROM quotes;",
    "DELETE FROM room_closures;",
    "DELETE FROM room_type_rates;",
    "DELETE FROM guests;",
    "DELETE FROM rooms;",
    "DELETE FROM room_types;",
    roomSeed,
  ];

  const baseRates = new Map();
  for (const match of roomSeed.matchAll(/\('type-([^']+)', '[^']+', \d+, (\d+),/g)) {
    baseRates.set(match[1], Number(match[2]));
  }
  const overrides = new Map();
  const fridayAndSaturday = [5, 6];
  const weekendSurchargeCents = 4000;
  for (const [type, baseRate] of baseRates) {
    for (let offset = -60; offset < 90; offset++) {
      const day = date(offset);
      if (!fridayAndSaturday.includes(new Date(`${day}T00:00:00.000Z`).getUTCDay())) continue;
      const price = baseRate + weekendSurchargeCents;
      overrides.set(`${type}:${day}`, price);
      statements.push(
        insert("room_type_rates", {
          id: `rate-${type}-${day}`,
          room_type_id: `type-${type}`,
          date: day,
          price_cents: price,
        }),
      );
    }
  }

  for (const { room, starts, ends, reason } of closures) {
    statements.push(
      insert("room_closures", {
        id: `closure-${room}`,
        room_id: `room-${room}`,
        starts: date(starts),
        ends: date(ends),
        reason,
        created_at: createdAt,
      }),
    );
  }

  const seedStaff = "seed-staff";
  statements.push(
    `INSERT OR IGNORE INTO user (id, name, email, username, display_username, role, created_at, updated_at) VALUES ('${seedStaff}', 'Recepción demo', 'demo.recepcion@example.invalid', 'demo.recepcion', 'demo.recepcion', 'staff', 0, 0);`,
  );
  for (const number of dirtyRooms) {
    statements.push(
      `UPDATE rooms SET housekeeping_status = 'dirty', housekeeping_changed_at = ${literal(`${date(0)}T08:00:00.000Z`)} WHERE id = 'room-${number}';`,
    );
  }

  const at = (offset, time = "12:00:00") => `${date(offset)}T${time}.000Z`;
  const reservationIds = new Map();
  const pendingCoupons = [];
  for (const [index, example] of busyExamples().entries()) {
    const guestId = `guest-${example.id}`;
    const reservationId = `reservation-${example.id}`;
    reservationIds.set(example.id, reservationId);
    const checkIn = date(example.arrival);
    const checkOut = date(example.arrival + example.nights);
    const status = example.status ?? "confirmed";
    const plan = ratePlans[example.plan ?? "flexible"];
    const created = example.created === undefined ? createdAt : at(example.created);
    statements.push(
      insert("guests", {
        id: guestId,
        full_name: example.name.join(" "),
        email: `${example.id}@example.com`,
        phone: `+51 9${String(index + 1).padStart(8, "0")}`,
        document_type: "DNI",
        document_number: String(index + 1).padStart(8, "0"),
        notes: "Huésped de prueba para la gestión del alojamiento.",
        created_at: created,
        ...guestOverrides(example.guest),
      }),
    );
    const cancelledAt =
      status === "cancelled"
        ? example.cancellation
          ? at(example.cancellation.recorded)
          : createdAt
        : null;
    statements.push(
      insert("reservations", {
        id: reservationId,
        code: `DEMO${String(index + 1).padStart(4, "0")}`,
        guest_id: guestId,
        check_in: checkIn,
        check_out: checkOut,
        status,
        cancelled_at: cancelledAt,
        cancellation_reason: status === "cancelled" ? (example.reason ?? null) : null,
        source: example.source ?? "desk",
        notes: "Reserva de prueba. Restablecer con pnpm db:reset:local.",
        created_at: created,
        rate_plan: plan.plan,
        cancellation_charge_basis: plan.chargeBasis,
        free_cancellation_days: plan.freeDays,
        free_cancellation_hours: plan.freeDays === null ? null : plan.freeDays * 24,
        payment_schedule: plan.paymentSchedule,
        price_adjustment_percent: plan.adjustmentPercent,
      }),
    );

    let total = 0;
    let firstNight = 0;
    let totalDiscount = 0;
    for (const [lineIndex, room] of example.rooms.entries()) {
      const baseRate = baseRates.get(room.type);
      if (baseRate === undefined) throw new Error(`Missing type-${room.type} in seed.sql`);
      const lineId = `line-${example.id}-${lineIndex + 1}`;
      const nights = Array.from({ length: example.nights }, (_, night) => {
        const day = date(example.arrival + night);
        if (room.flatRateCents !== undefined)
          return { date: day, price: room.flatRateCents, adjustment: 0 };
        const ordinary = overrides.get(`${room.type}:${day}`) ?? baseRate;
        const price = Math.floor((ordinary * (100 + plan.adjustmentPercent) + 50) / 100);
        return { date: day, price, adjustment: price - ordinary };
      });
      const subtotal = nights.reduce((sum, night) => sum + night.price, 0);
      const discount = room.fullDiscount ? subtotal : (room.discountCents ?? 0);
      if (!Number.isInteger(discount) || discount < 0) {
        throw new Error(`Invalid discount for ${lineId}`);
      }
      total += subtotal - discount;
      firstNight += nights[0].price;
      totalDiscount += discount;
      statements.push(
        insert("reservation_rooms", {
          id: lineId,
          reservation_id: reservationId,
          room_type_id: `type-${room.type}`,
          room_id: room.room ? `room-${room.room}` : null,
          adults: room.adults,
          children: room.children ?? 0,
          created_at: created,
        }),
      );
      for (const { date: day, price, adjustment } of nights) {
        statements.push(
          insert("reservation_room_nights", {
            id: `night-${lineId}-${day}`,
            reservation_room_id: lineId,
            date: day,
            price_cents: price,
            adjustment_cents: adjustment,
          }),
        );
      }
    }

    statements.push(
      `UPDATE reservations SET discount_cents = ${totalDiscount} WHERE id = ${literal(reservationId)};`,
    );
    for (const [guestIndex, guest] of (stayingGuests[example.id] ?? []).entries()) {
      statements.push(
        insert("reservation_guests", {
          id: `staying-${example.id}-${guestIndex + 1}`,
          reservation_id: reservationId,
          full_name: guest.name,
          document_type: guest.document ? "DNI" : null,
          document_number: guest.document,
          created_at: created,
        }),
      );
    }
    const amountOf = (value) =>
      value === "total" ? total : value === "first-night" ? Math.min(firstNight, total) : value;
    const paymentIds = [];
    for (const [part, payment] of (example.payments ?? []).entries()) {
      const id = `payment-${example.id}-${part + 1}`;
      paymentIds.push(id);
      statements.push(
        insert("payments", {
          id,
          reservation_id: reservationId,
          amount_cents: amountOf(payment.amount),
          method: payment.method,
          reference: payment.culqi ? null : `DEMO-${example.id}`.toUpperCase(),
          payment_date: date(payment.day ?? Math.min(0, example.arrival - 1)),
          created_at: created,
          notes: payment.culqi ? "Pago en línea con Culqi." : "Pago de prueba.",
          culqi_charge_id: payment.culqi ?? null,
        }),
      );
    }
    if (example.payment === "installments") {
      const third = Math.floor(total / 3);
      for (const [part, amount] of [third, third, total - third * 2].entries()) {
        statements.push(
          insert("payments", {
            id: `payment-${example.id}-${part + 1}`,
            reservation_id: reservationId,
            amount_cents: amount,
            method: ["cash", "transfer", "card"][part],
            reference: `DEMO-CUOTA-${part + 1}`,
            payment_date: date(Math.min(0, example.arrival)),
            created_at: created,
            notes: `Pago ${part + 1} de 3.`,
          }),
        );
      }
    } else if (example.payment) {
      const amount =
        example.payment === "full"
          ? total
          : example.payment === "credit"
            ? total + 5000
            : Math.floor(total / 2);
      statements.push(
        insert("payments", {
          id: `payment-${example.id}`,
          reservation_id: reservationId,
          amount_cents: amount,
          method: example.method ?? (index % 2 === 0 ? "card" : "transfer"),
          reference: `DEMO-${example.id}`.toUpperCase(),
          payment_date: date(Math.min(0, example.arrival - 1)),
          created_at: created,
          notes:
            example.payment === "credit"
              ? "Pago con saldo a favor por salida anticipada."
              : "Pago de prueba.",
        }),
      );
    }

    const cancellation = example.cancellation;
    if (cancellation) {
      const id = `cancellation-${example.id}`;
      const outcome = status === "no_show" ? "no_show" : "cancelled";
      statements.push(
        insert("reservation_cancellations", {
          id,
          reservation_id: reservationId,
          outcome,
          recorded_at: at(cancellation.recorded),
          free_until:
            outcome === "no_show" || cancellation.freeUntil === undefined
              ? null
              : date(cancellation.freeUntil),
          policy_charge_cents:
            cancellation.chargeCents ??
            (plan.chargeBasis === "final_total" ? total : Math.min(firstNight, total)),
          account_id: seedStaff,
          restored_at: cancellation.restored === undefined ? null : at(cancellation.restored),
        }),
      );
      for (const [waiverIndex, waiver] of (cancellation.waivers ?? []).entries()) {
        statements.push(
          insert("cancellation_waivers", {
            id: `${id}-waiver-${waiverIndex + 1}`,
            cancellation_id: id,
            amount_cents: waiver.amountCents,
            reason: waiver.reason,
            recorded_at: at(cancellation.recorded, "12:05:00"),
            account_id: seedStaff,
          }),
        );
      }
    }
    for (const [refundIndex, refund] of (example.refunds ?? []).entries()) {
      const resolved = refund.status !== "requested";
      statements.push(
        insert("refunds", {
          id: `refund-${example.id}-${refundIndex + 1}`,
          reservation_id: reservationId,
          payment_id: paymentIds[0],
          amount_cents: refund.amountCents ?? amountOf(refund.amount),
          method: refund.method,
          reference: refund.reference ?? null,
          reason: "Saldo a favor tras la cancelación.",
          status: refund.status,
          requested_at: at(cancellation?.recorded ?? 0, "12:10:00"),
          requested_account_id: seedStaff,
          resolved_at: resolved ? at(0, "09:00:00") : null,
          resolved_account_id: resolved ? seedStaff : null,
          refund_date: refund.status === "completed" ? date(0) : null,
          completion_reference: refund.status === "completed" ? (refund.reference ?? null) : null,
          failure_reason: refund.status === "failed" ? refund.failure : null,
        }),
      );
    }
    if (example.coupon) {
      const paid = (example.payments ?? []).reduce((sum, p) => sum + amountOf(p.amount), 0);
      const charge = cancellation?.chargeCents ?? 0;
      pendingCoupons.push({ example, reservationId, value: paid - charge });
    }
  }

  for (const { example, reservationId, value } of pendingCoupons) {
    const { code, issued, redeemCents = 0, redeemedBy } = example.coupon;
    const id = `coupon-${example.id}`;
    const issuedAt = at(issued, "12:15:00");
    const expires = new Date(`${date(issued)}T00:00:00.000Z`);
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    statements.push(
      insert("coupons", {
        id,
        code,
        source_reservation_id: reservationId,
        value_cents: value,
        balance_cents: value - redeemCents,
        issued_at: issuedAt,
        expires_on: expires.toISOString().slice(0, 10),
        account_id: seedStaff,
      }),
      insert("coupon_movements", {
        id: `${id}-issue`,
        coupon_id: id,
        reservation_id: reservationId,
        kind: "issue",
        amount_cents: value,
        recorded_at: issuedAt,
        recorded_on: date(issued),
        account_id: seedStaff,
      }),
    );
    if (redeemCents > 0) {
      statements.push(
        insert("coupon_movements", {
          id: `${id}-redeem`,
          coupon_id: id,
          reservation_id: reservationIds.get(redeemedBy),
          kind: "redeem",
          amount_cents: redeemCents,
          recorded_at: at(0, "10:00:00"),
          recorded_on: date(0),
          account_id: seedStaff,
        }),
      );
    }
  }
  return statements.join("\n");
}
