import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildResetSql, referenceDate } from '../../seed-data.mjs'

const backendDir = new URL('../../', import.meta.url)
const migrationsDir = new URL('drizzle/', backendDir)
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', migrationsDir), 'utf8'))
const tables = [
  'room_types', 'rooms', 'guests', 'reservations', 'reservation_rooms',
  'reservation_room_nights', 'payments', 'room_type_rates', 'room_closures',
]
let db

function snapshot() {
  return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]))
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const entry of journal.entries) {
    db.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), 'utf8'))
  }
  db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO d1_migrations VALUES (1, 'applied');")
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

describe('local dummy data reset', () => {
  it('restores every application table after edits, deletions, assignments, and additions', () => {
    const sql = buildResetSql('2026-10-06')
    db.exec(sql)
    const baseline = snapshot()
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all()
    db.exec(`
      UPDATE room_types SET name = 'Edited Standard', base_rate_cents = 12345 WHERE id = 'type-standard';
      UPDATE rooms SET number = 'edited-101' WHERE id = 'room-101';
      UPDATE guests SET first_name = 'Edited', notes = 'Changed in portal' WHERE id = 'guest-arrival';
      UPDATE reservations SET notes = 'Edited booking' WHERE id = 'reservation-arrival';
      UPDATE reservation_rooms SET room_id = 'room-104', status = 'checked_in' WHERE id = 'line-alex-1';
      UPDATE reservation_room_nights SET price_cents = 1 WHERE reservation_room_id = 'line-arrival-1';
      UPDATE payments SET amount_cents = 100 WHERE id = 'payment-family';
      DELETE FROM payments WHERE id = 'refund-cancelled';
      DELETE FROM room_type_rates WHERE room_type_id = 'type-suite';
      DELETE FROM room_closures WHERE id = 'closure-110';
      DELETE FROM reservation_room_nights WHERE reservation_room_id = 'line-sam-1';
      DELETE FROM reservation_rooms WHERE id = 'line-sam-1';
      DELETE FROM reservations WHERE id = 'reservation-sam';
      DELETE FROM guests WHERE id = 'guest-sam';
      INSERT INTO room_types VALUES ('custom', 'Custom', 2, 5000, '2026-10-06');
      INSERT INTO rooms VALUES ('custom', '999', 'custom');
      INSERT INTO guests (id, first_name, last_name, created_at) VALUES ('custom', 'New', 'Guest', '2026-10-06');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
        VALUES ('custom', 'CUSTOM', 'custom', '2026-10-06', '2026-10-07', '2026-10-06');
      INSERT INTO reservation_rooms (id, reservation_id, room_type_id, room_id, adults, status, created_at)
        VALUES ('custom', 'custom', 'custom', 'custom', 1, 'confirmed', '2026-10-06');
      INSERT INTO reservation_room_nights VALUES ('custom', 'custom', '2026-10-06', 5000);
      INSERT INTO payments (id, reservation_id, amount_cents, method, paid_at)
        VALUES ('custom', 'custom', 5000, 'cash', '2026-10-06');
      INSERT INTO room_type_rates VALUES ('custom', 'custom', '2026-10-07', 6000);
      INSERT INTO room_closures (id, room_id, starts, ends, created_at)
        VALUES ('custom', 'custom', '2026-10-07', '2026-10-08', '2026-10-06');
    `)
    expect(snapshot()).not.toEqual(baseline)
    db.exec(sql)
    expect(snapshot()).toEqual(baseline)
    db.exec(sql)
    expect(snapshot()).toEqual(baseline)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.prepare('SELECT * FROM d1_migrations').all()).toEqual([{ id: 1, name: 'applied' }])
    expect(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all()).toEqual(triggers)
  })

  it('creates valid stays, occupancies, nightly prices, payments, and closures', () => {
    db.exec(buildResetSql('2026-10-06'))
    expect(db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count).toBe(60)
    expect(db.prepare('SELECT COUNT(*) AS count FROM reservations').get().count).toBe(16)
    expect(db.prepare('SELECT COUNT(*) AS count FROM room_closures').get().count).toBe(3)
    expect(db.prepare('SELECT DISTINCT status FROM reservation_rooms ORDER BY status').all().map((row) => row.status))
      .toEqual(['cancelled', 'checked_in', 'checked_out', 'confirmed', 'no_show'])
    expect(db.prepare("SELECT COUNT(*) AS count FROM reservation_rooms WHERE room_id IS NULL AND status = 'confirmed'").get().count).toBe(4)
    expect(db.prepare(`SELECT rr.id FROM reservation_rooms rr
      JOIN room_types t ON t.id = rr.room_type_id WHERE rr.adults + rr.children > t.max_occupancy`).all()).toEqual([])
    expect(db.prepare(`SELECT rr.id FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      LEFT JOIN reservation_room_nights n ON n.reservation_room_id = rr.id
      GROUP BY rr.id HAVING COUNT(n.id) != julianday(r.check_out) - julianday(r.check_in)
      OR MIN(n.date) != r.check_in OR MAX(n.date) != date(r.check_out, '-1 day')`).all()).toEqual([])
    expect(db.prepare(`SELECT n.id FROM reservation_room_nights n
      JOIN reservation_rooms rr ON rr.id = n.reservation_room_id
      JOIN room_types t ON t.id = rr.room_type_id
      LEFT JOIN room_type_rates rate ON rate.room_type_id = t.id AND rate.date = n.date
      WHERE n.price_cents != CASE WHEN rr.id = 'line-long-stay-1' THEN 9500 ELSE COALESCE(rate.price_cents, t.base_rate_cents) END`).all()).toEqual([])
    expect(db.prepare("SELECT SUM(amount_cents) AS paid FROM payments WHERE reservation_id = 'reservation-cancelled'").get().paid).toBe(0)
    expect(db.prepare("SELECT last_name FROM guests WHERE id = 'guest-arrival'").get().last_name).toBe("O'Brien")
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('moves scenarios across month boundaries using UTC dates and leap days', () => {
    db.exec(buildResetSql('2028-02-28'))
    expect(db.prepare("SELECT check_in, check_out FROM reservations WHERE id = 'reservation-turnover'").get())
      .toEqual({ check_in: '2028-03-01', check_out: '2028-03-04' })
    expect(db.prepare("SELECT date FROM reservation_room_nights WHERE reservation_room_id = 'line-arrival-1' ORDER BY date").all())
      .toEqual([{ date: '2028-02-28' }, { date: '2028-02-29' }, { date: '2028-03-01' }])
  })

  it('defaults to today in UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T20:30:00-08:00'))
    expect(referenceDate()).toBe('2027-01-01')
    db.exec(buildResetSql())
    expect(db.prepare("SELECT check_in FROM reservations WHERE id = 'reservation-arrival'").get().check_in).toBe('2027-01-01')
  })

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', 'not-a-date', '9999-12-31', '0000-01-01'])
    ('rejects an invalid reference or out-of-range scenario date: %s', (value) => {
      expect(() => buildResetSql(value)).toThrow('Date must be a valid UTC calendar date')
    })

  it.each([['--remote'], ['--date=2026-02-30'], ['--date'], ['--date=2026-10-06', '--date=2026-10-07']])
    ('rejects invalid CLI arguments before running Wrangler: %j', (...args) => {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('seed-reset.mjs', backendDir)), ...args], { encoding: 'utf8' })
      expect(result.status).toBe(1)
      expect(result.stderr).toBeTruthy()
      expect(result.stdout).toBe('')
    })
})
