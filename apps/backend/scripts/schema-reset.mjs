export const schemaObjectsSql = `SELECT m.type, m.name, m.tbl_name,
    (SELECT group_concat(DISTINCT f."table") FROM pragma_foreign_key_list(m.name) f) AS refs
  FROM sqlite_master m WHERE m.type IN ('table', 'trigger')`;

const internal = (name) => name.startsWith("sqlite_") || name.startsWith("_cf_");

export const identifier = (name) => `"${name.replaceAll('"', '""')}"`;

function applicationTables(objects) {
  return new Map(
    objects
      .filter((object) => object.type === "table" && !internal(object.name))
      .map((object) => [
        object.name,
        (object.refs ?? "").split(",").filter((parent) => parent && parent !== object.name),
      ]),
  );
}

export function tablesReferencingFirst(objects, roots) {
  const tables = applicationTables(objects);
  const chosen = new Set(roots ?? tables.keys());
  for (let grew = true; grew;) {
    grew = false;
    for (const [table, parents] of tables) {
      if (chosen.has(table) || !parents.some((parent) => chosen.has(parent))) continue;
      chosen.add(table);
      grew = true;
    }
  }
  const order = [];
  while (chosen.size) {
    const next = [...chosen].find(
      (table) => ![...chosen].some((other) => tables.get(other)?.includes(table)),
    );
    if (!next) throw new Error(`Foreign keys form a cycle among ${[...chosen].join(", ")}`);
    order.push(next);
    chosen.delete(next);
  }
  return order;
}

export function buildSchemaResetSql(objects) {
  const triggers = objects.filter(
    (object) => object.type === "trigger" && !internal(object.tbl_name),
  );
  return [
    ...triggers.map((trigger) => `DROP TRIGGER IF EXISTS ${identifier(trigger.name)};`),
    ...tablesReferencingFirst(objects).map((table) => `DROP TABLE IF EXISTS ${identifier(table)};`),
  ].join("\n");
}
