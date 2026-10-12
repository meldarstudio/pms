import { URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { bill } from '../lib/workflow-billing'

it('preserves legacy totals, signed payment effects, unknown history, and excluded discounts', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys=ON')
    const dir = new URL('../../drizzle/', import.meta.url)
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8')) as {
      entries: { idx: number; tag: string }[]
    }
    for (const e of journal.entries.filter((e) => e.idx <= 6))
      db.exec(readFileSync(new URL(`${e.tag}.sql`, dir), 'utf8'))
    db.exec(`INSERT INTO room_types VALUES ('t','Standard',2,10000,'2026-10-10');
   INSERT INTO rooms VALUES ('r','101','t');
   INSERT INTO guests (id,first_name,last_name,created_at) VALUES ('g','Ada','Lovelace','2026-10-10');
   INSERT INTO reservations (id,code,guest_id,check_in,check_out,created_at) VALUES ('b','B','g','2026-10-10','2026-10-12','2026-10-10');
   INSERT INTO reservation_rooms (id,reservation_id,room_type_id,room_id,adults,status,discount_cents,created_at) VALUES ('l','b','t','r',1,'checked_out',1000,'2026-10-10'),('c','b','t',NULL,1,'cancelled',5000,'2026-10-10');
   INSERT INTO reservation_room_nights VALUES ('n','l','2026-10-10',10000),('n2','c','2026-10-10',10000);
   INSERT INTO payments (id,reservation_id,amount_cents,method,paid_at,reference) VALUES ('p','b',20000,'cash','2026-10-10T13:45:00Z',' old-receipt '),('negative','b',-3000,'cash','2026-10-10',NULL);`)
    for (const e of journal.entries.filter((e) => e.idx > 6 && e.idx <= 15))
      db.exec(readFileSync(new URL(`${e.tag}.sql`, dir), 'utf8'))
    const entries = db
      .prepare(
        'SELECT id,kind,amount_cents AS amountCents,applied_cents AS appliedCents,created_at AS createdAt,voided_at AS voidedAt FROM financial_entries',
      )
      .all() as unknown as Parameters<typeof bill>[1]
    expect(bill(10000, entries, 1000)).toMatchObject({
      totalCents: 9000,
      paidCents: 17000,
      creditCents: 8000,
    })
    expect(db.prepare("SELECT discount_cents FROM reservations WHERE id='b'").get()).toEqual({
      discount_cents: 1000,
    })
    expect(entries.find((e) => e.id === 'legacy-discount-l')).toBeUndefined()
    expect(entries.find((e) => e.id === 'legacy-discount-c')).toMatchObject({
      kind: 'legacy_discount_excluded',
      amountCents: 5000,
    })
    expect(
      db
        .prepare(
          "SELECT status,original_check_in,actual_arrival FROM reservation_rooms WHERE id='l'",
        )
        .get(),
    ).toEqual({ status: 'checked_out', original_check_in: null, actual_arrival: null })
    expect(db.prepare('SELECT count(*) AS n FROM payments').get()?.n).toBe(2)
    expect(db.prepare("SELECT reference FROM payments WHERE id='p'").get()).toEqual({ reference: 'OLD-RECEIPT' })
    expect(db.prepare("SELECT reference FROM payments WHERE id='negative'").get()).toEqual({ reference: null })
    expect(db.prepare("SELECT payment_date,reference FROM financial_entries WHERE id='legacy-payment-p'").get()).toEqual({
      payment_date: '2026-10-10', reference: 'OLD-RECEIPT',
    })
    db.exec("INSERT INTO reservations (id,code,guest_id,check_in,check_out,created_at) VALUES ('other','OTHER','g','2026-10-10','2026-10-12','2026-10-10')")
    expect(() => db.exec("INSERT INTO reservation_guests (id,reservation_id,reservation_room_id,first_name,last_name,created_at) VALUES ('wrong','other','l','Test','Guest','2026-10-10')")).toThrow('guest room must belong to this reservation')
    expect(db.prepare("SELECT full_name FROM guests WHERE id='g'").get()).toEqual({ full_name: 'Ada Lovelace' })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})
