UPDATE financial_entries
SET payment_date = substr(occurred_at, 1, 10)
WHERE kind IN ('payment', 'legacy_signed');
--> statement-breakpoint
UPDATE financial_entries
SET reference = (SELECT p.reference FROM payments p WHERE 'legacy-payment-' || p.id = financial_entries.id)
WHERE legacy = 1 AND EXISTS (SELECT 1 FROM payments p WHERE 'legacy-payment-' || p.id = financial_entries.id);
--> statement-breakpoint
CREATE TRIGGER reservation_guest_room_insert
BEFORE INSERT ON reservation_guests
WHEN NEW.reservation_room_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM reservation_rooms r
  WHERE r.id = NEW.reservation_room_id AND r.reservation_id = NEW.reservation_id
)
BEGIN
  SELECT RAISE(ABORT, 'guest room must belong to this reservation');
END;
--> statement-breakpoint
CREATE TRIGGER reservation_guest_room_update
BEFORE UPDATE ON reservation_guests
WHEN NEW.reservation_room_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM reservation_rooms r
  WHERE r.id = NEW.reservation_room_id AND r.reservation_id = NEW.reservation_id
)
BEGIN
  SELECT RAISE(ABORT, 'guest room must belong to this reservation');
END;
