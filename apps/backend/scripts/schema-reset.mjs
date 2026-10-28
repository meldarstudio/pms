// Child tables precede their parents so rebuilding also works with foreign keys enabled.
const tables = [
  "property_write_context",
  "reservation_requests",
  "reservation_events",
  "financial_entries",
  "reservation_guests",
  "reservation_room_nights",
  "refunds",
  "payments",
  "cancellation_waivers",
  "reservation_cancellations",
  "reservation_rooms",
  "reservations",
  "room_closures",
  "room_type_rates",
  "guests",
  "rooms",
  "room_types",
  "session",
  "account",
  "verification",
  "user",
  "d1_migrations",
];

const identifier = (name) => `"${name.replaceAll('"', '""')}"`;

export function buildSchemaResetSql(objects) {
  const triggers = objects.filter(
    (object) => object.type === "trigger" && tables.includes(object.tbl_name),
  );
  return [
    ...triggers.map((trigger) => `DROP TRIGGER IF EXISTS ${identifier(trigger.name)};`),
    ...tables.map((table) => `DROP TABLE IF EXISTS ${identifier(table)};`),
  ].join("\n");
}
