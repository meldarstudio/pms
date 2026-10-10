-- Preserve surviving history without inventing arrival times or reasons.
UPDATE reservation_rooms SET
 check_in = (SELECT check_in FROM reservations WHERE id = reservation_id),
 check_out = (SELECT check_out FROM reservations WHERE id = reservation_id),
 original_check_in = (SELECT check_in FROM reservations WHERE id = reservation_id),
 original_check_out = (SELECT check_out FROM reservations WHERE id = reservation_id),
 assignment_start = (SELECT check_in FROM reservations WHERE id = reservation_id);
--> statement-breakpoint
INSERT INTO financial_entries (id,reservation_id,kind,amount_cents,applied_cents,reason,method,occurred_at,created_at,legacy)
 SELECT 'legacy-payment-' || id,reservation_id,'legacy_signed',amount_cents,0,notes,method,paid_at,paid_at,1 FROM payments;
--> statement-breakpoint
INSERT INTO financial_entries (id,reservation_id,kind,amount_cents,applied_cents,occurred_at,created_at,legacy)
 SELECT 'legacy-discount-' || rr.id,rr.reservation_id,'discount',
 CASE WHEN rr.status = 'cancelled' THEN 0 ELSE min(rr.discount_cents, coalesce((SELECT sum(price_cents) FROM reservation_room_nights WHERE reservation_room_id=rr.id),0)) END,
 0,rr.created_at,rr.created_at,1
 FROM reservation_rooms rr WHERE rr.discount_cents > 0;
--> statement-breakpoint
CREATE TRIGGER reservation_request_guard BEFORE INSERT ON reservation_requests BEGIN
 SELECT RAISE(ABORT, 'stale reservation') WHERE NEW.expected_version != (SELECT version FROM reservations WHERE id=NEW.reservation_id);
 UPDATE reservations SET version=version+1 WHERE id=NEW.reservation_id;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_type_capacity_insert;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_type_capacity_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.status IN ('confirmed', 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    WITH RECURSIVE nights(d) AS (
      SELECT coalesce(NEW.check_in, check_in) FROM reservations WHERE id = NEW.reservation_id
      UNION ALL
      SELECT date(d, '+1 day') FROM nights
      WHERE date(d, '+1 day') < (SELECT coalesce(NEW.check_out, check_out) FROM reservations WHERE id = NEW.reservation_id)
    )
    SELECT 1 FROM nights
    WHERE (
      SELECT COUNT(*) FROM rooms WHERE room_type_id = NEW.room_type_id
    ) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = NEW.room_type_id
        AND rr.status IN ('confirmed', 'checked_in')
        AND coalesce(rr.assignment_start, rr.check_in, r.check_in) <= nights.d
        AND coalesce(rr.check_out, r.check_out) > nights.d
    ) + (
      SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      WHERE rm.room_type_id = NEW.room_type_id
        AND c.starts <= nights.d
        AND c.ends > nights.d
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_type_capacity_update;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_type_capacity_update
BEFORE UPDATE OF room_type_id, status, check_in, check_out ON reservation_rooms
WHEN NEW.status IN ('confirmed', 'checked_in')

BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    WITH RECURSIVE nights(d) AS (
      SELECT coalesce(NEW.check_in, check_in) FROM reservations WHERE id = NEW.reservation_id
      UNION ALL
      SELECT date(d, '+1 day') FROM nights
      WHERE date(d, '+1 day') < (SELECT coalesce(NEW.check_out, check_out) FROM reservations WHERE id = NEW.reservation_id)
    )
    SELECT 1 FROM nights
    WHERE (
      SELECT COUNT(*) FROM rooms WHERE room_type_id = NEW.room_type_id
    ) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = NEW.room_type_id
        AND rr.id != NEW.id
        AND rr.status IN ('confirmed', 'checked_in')
        AND coalesce(rr.assignment_start, rr.check_in, r.check_in) <= nights.d
        AND coalesce(rr.check_out, r.check_out) > nights.d
    ) + (
      SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      WHERE rm.room_type_id = NEW.room_type_id
        AND c.starts <= nights.d
        AND c.ends > nights.d
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservations_dates_capacity;
--> statement-breakpoint
DROP TRIGGER IF EXISTS room_closures_capacity_insert;
--> statement-breakpoint
CREATE TRIGGER room_closures_capacity_insert
BEFORE INSERT ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    WITH RECURSIVE nights(d) AS (
      SELECT NEW.starts
      UNION ALL
      SELECT date(d, '+1 day') FROM nights
      WHERE date(d, '+1 day') < NEW.ends
    )
    SELECT 1 FROM nights
    WHERE (
      SELECT COUNT(*) FROM rooms
      WHERE room_type_id = (SELECT room_type_id FROM rooms WHERE id = NEW.room_id)
    ) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      JOIN rooms target ON target.id = NEW.room_id
      WHERE rr.room_type_id = target.room_type_id
        AND rr.status IN ('confirmed', 'checked_in')
        AND coalesce(rr.assignment_start, rr.check_in, r.check_in) <= nights.d
        AND coalesce(rr.check_out, r.check_out) > nights.d
    ) + (
      SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      JOIN rooms target ON target.id = NEW.room_id
      WHERE rm.room_type_id = target.room_type_id
        AND c.starts <= nights.d
        AND c.ends > nights.d
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS room_closures_capacity_update;
--> statement-breakpoint
CREATE TRIGGER room_closures_capacity_update
BEFORE UPDATE OF starts, ends ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    WITH RECURSIVE nights(d) AS (
      SELECT NEW.starts
      UNION ALL
      SELECT date(d, '+1 day') FROM nights
      WHERE date(d, '+1 day') < NEW.ends
    )
    SELECT 1 FROM nights
    WHERE (
      SELECT COUNT(*) FROM rooms
      WHERE room_type_id = (SELECT room_type_id FROM rooms WHERE id = NEW.room_id)
    ) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      JOIN rooms target ON target.id = NEW.room_id
      WHERE rr.room_type_id = target.room_type_id
        AND rr.status IN ('confirmed', 'checked_in')
        AND coalesce(rr.assignment_start, rr.check_in, r.check_in) <= nights.d
        AND coalesce(rr.check_out, r.check_out) > nights.d
    ) + (
      SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      JOIN rooms target ON target.id = NEW.room_id
      WHERE c.id != NEW.id
        AND rm.room_type_id = target.room_type_id
        AND c.starts <= nights.d
        AND c.ends > nights.d
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_room_overlap_insert;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_overlap_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('confirmed', 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'room taken')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND rr.status IN ('confirmed', 'checked_in')
      AND coalesce(rr.assignment_start, rr.check_in, r.check_in) < coalesce(NEW.check_out, nr.check_out)
      AND coalesce(rr.check_out, r.check_out) > coalesce(NEW.assignment_start, NEW.check_in, nr.check_in)
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_room_overlap_update;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_overlap_update
BEFORE UPDATE OF room_id, status, check_in, check_out, assignment_start ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('confirmed', 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'room taken')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND rr.id != NEW.id
      AND rr.status IN ('confirmed', 'checked_in')
      AND coalesce(rr.assignment_start, rr.check_in, r.check_in) < coalesce(NEW.check_out, nr.check_out)
      AND coalesce(rr.check_out, r.check_out) > coalesce(NEW.assignment_start, NEW.check_in, nr.check_in)
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservations_dates_room;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_room_closure_insert;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_closure_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('confirmed', 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'room closed')
  WHERE EXISTS (
    SELECT 1 FROM room_closures c
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE c.room_id = NEW.room_id
      AND c.starts < coalesce(NEW.check_out, nr.check_out)
      AND c.ends > coalesce(NEW.assignment_start, NEW.check_in, nr.check_in)
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_room_closure_update;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_closure_update
BEFORE UPDATE OF room_id, status, check_in, check_out, assignment_start ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('confirmed', 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'room closed')
  WHERE EXISTS (
    SELECT 1 FROM room_closures c
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE c.room_id = NEW.room_id
      AND c.starts < coalesce(NEW.check_out, nr.check_out)
      AND c.ends > coalesce(NEW.assignment_start, NEW.check_in, nr.check_in)
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservations_dates_closure;
--> statement-breakpoint
DROP TRIGGER IF EXISTS room_closures_stay_overlap_insert;
--> statement-breakpoint
CREATE TRIGGER room_closures_stay_overlap_insert
BEFORE INSERT ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'closure overlaps stay')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND rr.status IN ('confirmed', 'checked_in')
      AND coalesce(rr.assignment_start, rr.check_in, r.check_in) < NEW.ends
      AND coalesce(rr.check_out, r.check_out) > NEW.starts
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS room_closures_stay_overlap_update;
--> statement-breakpoint
CREATE TRIGGER room_closures_stay_overlap_update
BEFORE UPDATE OF starts, ends ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'closure overlaps stay')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND rr.status IN ('confirmed', 'checked_in')
      AND coalesce(rr.assignment_start, rr.check_in, r.check_in) < NEW.ends
      AND coalesce(rr.check_out, r.check_out) > NEW.starts
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS rooms_type_change;
--> statement-breakpoint
CREATE TRIGGER rooms_type_change
BEFORE UPDATE OF room_type_id ON rooms
WHEN NEW.room_type_id != OLD.room_type_id
BEGIN
  SELECT RAISE(ABORT, 'room has an assigned stay')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    WHERE rr.room_id = OLD.id
      AND rr.status IN ('confirmed', 'checked_in')
      AND coalesce(rr.check_out, r.check_out) > date('now')
  );
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    SELECT 1 FROM (
      SELECT CASE WHEN coalesce(rr.assignment_start, rr.check_in, r.check_in) > date('now') THEN coalesce(rr.assignment_start, rr.check_in, r.check_in) ELSE date('now') END AS d
      FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = OLD.room_type_id
        AND rr.status IN ('confirmed', 'checked_in')
        AND coalesce(rr.check_out, r.check_out) > date('now')
      UNION
      SELECT CASE WHEN c.starts > date('now') THEN c.starts ELSE date('now') END
      FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      WHERE rm.room_type_id = OLD.room_type_id
        AND c.room_id != OLD.id
        AND c.ends > date('now')
    ) nights
    WHERE NOT EXISTS (
      SELECT 1 FROM room_closures mine
      WHERE mine.room_id = OLD.id
        AND mine.starts <= nights.d
        AND mine.ends > nights.d
    )
    AND (
      SELECT COUNT(*) FROM rooms WHERE room_type_id = OLD.room_type_id
    ) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = OLD.room_type_id
        AND rr.status IN ('confirmed', 'checked_in')
        AND coalesce(rr.assignment_start, rr.check_in, r.check_in) <= nights.d
        AND coalesce(rr.check_out, r.check_out) > nights.d
    ) + (
      SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      WHERE rm.room_type_id = OLD.room_type_id
        AND c.room_id != OLD.id
        AND c.starts <= nights.d
        AND c.ends > nights.d
    )
  );
END;
--> statement-breakpoint
CREATE TRIGGER workflow_room_valid_insert BEFORE INSERT ON reservation_rooms BEGIN
 SELECT RAISE(ABORT, 'invalid room assignment') WHERE NEW.room_id IS NOT NULL AND NEW.room_type_id != (SELECT room_type_id FROM rooms WHERE id=NEW.room_id);
 SELECT RAISE(ABORT, 'invalid occupancy') WHERE NEW.adults < 1 OR NEW.children < 0 OR NEW.adults+NEW.children > (SELECT max_occupancy FROM room_types WHERE id=NEW.room_type_id);
END;
--> statement-breakpoint
CREATE TRIGGER workflow_room_valid_update BEFORE UPDATE ON reservation_rooms BEGIN
 SELECT RAISE(ABORT, 'invalid room assignment') WHERE NEW.room_id IS NOT NULL AND NEW.room_type_id != (SELECT room_type_id FROM rooms WHERE id=NEW.room_id);
 SELECT RAISE(ABORT, 'invalid occupancy') WHERE NEW.adults < 1 OR NEW.children < 0 OR NEW.adults+NEW.children > (SELECT max_occupancy FROM room_types WHERE id=NEW.room_type_id);
END;
