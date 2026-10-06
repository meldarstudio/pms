import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof getDb>

export async function runBatch(db: Db, statements: unknown[]) {
  if (statements.length === 0) return
  await (db.batch as (queries: unknown[]) => Promise<unknown>)(statements)
}
