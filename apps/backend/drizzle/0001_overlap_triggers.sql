-- Availability, assignment, closure, and staying-guest guards.
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
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_closure_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND (SELECT status FROM reservations WHERE id = NEW.reservation_id) IN ('confirmed', 'checked_in', 'checked_out')
BEGIN
  SELECT RAISE(ABORT, 'room closed')
  WHERE EXISTS (
    SELECT 1 FROM room_closures c
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE c.room_id = NEW.room_id
      AND c.starts < nr.check_out
      AND c.ends > nr.check_in
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_closure_update
BEFORE UPDATE OF reservation_id, room_type_id, room_id ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND (SELECT status FROM reservations WHERE id = NEW.reservation_id) IN ('confirmed', 'checked_in', 'checked_out')
BEGIN
  SELECT RAISE(ABORT, 'room closed')
  WHERE EXISTS (
    SELECT 1 FROM room_closures c
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE c.room_id = NEW.room_id
      AND c.starts < nr.check_out
      AND c.ends > nr.check_in
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_overlap_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND (SELECT status FROM reservations WHERE id = NEW.reservation_id) IN ('confirmed', 'checked_in', 'checked_out')
BEGIN
  SELECT RAISE(ABORT, 'room taken')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND r.status IN ('confirmed', 'checked_in', 'checked_out')
      AND r.check_in < nr.check_out
      AND r.check_out > nr.check_in
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_overlap_update
BEFORE UPDATE OF reservation_id, room_type_id, room_id ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND (SELECT status FROM reservations WHERE id = NEW.reservation_id) IN ('confirmed', 'checked_in', 'checked_out')
BEGIN
  SELECT RAISE(ABORT, 'room taken')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND rr.id != NEW.id
      AND r.status IN ('confirmed', 'checked_in', 'checked_out')
      AND r.check_in < nr.check_out
      AND r.check_out > nr.check_in
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_type_capacity_insert
BEFORE INSERT ON reservation_rooms
WHEN (SELECT status FROM reservations WHERE id = NEW.reservation_id) IN ('confirmed', 'checked_in', 'checked_out')
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    WITH RECURSIVE nights(d) AS (
      SELECT check_in FROM reservations WHERE id = NEW.reservation_id
      UNION ALL
      SELECT date(d, '+1 day') FROM nights
      WHERE date(d, '+1 day') < (SELECT check_out FROM reservations WHERE id = NEW.reservation_id)
    )
    SELECT 1 FROM nights
    WHERE (
      SELECT COUNT(*) FROM rooms WHERE room_type_id = NEW.room_type_id
    ) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = NEW.room_type_id
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_in <= nights.d
        AND r.check_out > nights.d
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
CREATE TRIGGER reservation_rooms_type_capacity_update
BEFORE UPDATE OF reservation_id, room_type_id, room_id ON reservation_rooms
WHEN (SELECT status FROM reservations WHERE id = NEW.reservation_id) IN ('confirmed', 'checked_in', 'checked_out')

BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    WITH RECURSIVE nights(d) AS (
      SELECT check_in FROM reservations WHERE id = NEW.reservation_id
      UNION ALL
      SELECT date(d, '+1 day') FROM nights
      WHERE date(d, '+1 day') < (SELECT check_out FROM reservations WHERE id = NEW.reservation_id)
    )
    SELECT 1 FROM nights
    WHERE (
      SELECT COUNT(*) FROM rooms WHERE room_type_id = NEW.room_type_id
    ) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = NEW.room_type_id
        AND rr.id != NEW.id
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_in <= nights.d
        AND r.check_out > nights.d
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
CREATE TRIGGER reservations_inventory_update
BEFORE UPDATE OF status, check_in, check_out ON reservations
WHEN NEW.status IN ('confirmed', 'checked_in', 'checked_out')
BEGIN
 SELECT RAISE(ABORT, 'check-in requires an assigned room') WHERE NEW.status = 'checked_in'
   AND EXISTS (SELECT 1 FROM reservation_rooms WHERE reservation_id = NEW.id AND room_id IS NULL);
 SELECT RAISE(ABORT, 'room taken') WHERE EXISTS (
   SELECT 1 FROM reservation_rooms own JOIN reservation_rooms other ON own.room_id = other.room_id AND own.id != other.id
   JOIN reservations r ON r.id = other.reservation_id
   WHERE own.reservation_id = NEW.id AND (other.reservation_id = NEW.id OR
     (r.status IN ('confirmed','checked_in','checked_out') AND r.check_in < NEW.check_out AND r.check_out > NEW.check_in))
 );
 SELECT RAISE(ABORT, 'room closed') WHERE EXISTS (
   SELECT 1 FROM reservation_rooms own JOIN room_closures c ON c.room_id = own.room_id
   WHERE own.reservation_id = NEW.id AND c.starts < NEW.check_out AND c.ends > NEW.check_in
 );
 SELECT RAISE(ABORT, 'no availability') WHERE EXISTS (
   WITH RECURSIVE nights(d) AS (
     SELECT NEW.check_in UNION ALL SELECT date(d,'+1 day') FROM nights WHERE date(d,'+1 day') < NEW.check_out
   )
   SELECT 1 FROM nights CROSS JOIN (SELECT DISTINCT room_type_id FROM reservation_rooms WHERE reservation_id = NEW.id) own
   WHERE (SELECT COUNT(*) FROM reservation_rooms WHERE reservation_id = NEW.id AND room_type_id = own.room_type_id)
     + (SELECT COUNT(*) FROM reservation_rooms rr JOIN reservations r ON r.id = rr.reservation_id
        WHERE r.id != NEW.id AND rr.room_type_id = own.room_type_id AND r.status IN ('confirmed','checked_in','checked_out')
          AND r.check_in <= nights.d AND r.check_out > nights.d)
     + (SELECT COUNT(DISTINCT c.room_id) FROM room_closures c JOIN rooms rm ON rm.id = c.room_id
        WHERE rm.room_type_id = own.room_type_id AND c.starts <= nights.d AND c.ends > nights.d)
     > (SELECT COUNT(*) FROM rooms WHERE room_type_id = own.room_type_id)
 );
END;
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
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_in <= nights.d
        AND r.check_out > nights.d
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
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_in <= nights.d
        AND r.check_out > nights.d
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
CREATE TRIGGER room_closures_overlap_insert
BEFORE INSERT ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'closure overlaps closure')
  WHERE EXISTS (
    SELECT 1 FROM room_closures c
    WHERE c.room_id = NEW.room_id
      AND c.starts < NEW.ends
      AND c.ends > NEW.starts
  );
END;
--> statement-breakpoint
CREATE TRIGGER room_closures_overlap_update
BEFORE UPDATE OF starts, ends ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'closure overlaps closure')
  WHERE EXISTS (
    SELECT 1 FROM room_closures c
    WHERE c.room_id = NEW.room_id
      AND c.id != NEW.id
      AND c.starts < NEW.ends
      AND c.ends > NEW.starts
  );
END;
--> statement-breakpoint
CREATE TRIGGER room_closures_stay_overlap_insert
BEFORE INSERT ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'closure overlaps stay')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND r.status IN ('confirmed', 'checked_in', 'checked_out')
      AND r.check_in < NEW.ends
      AND r.check_out > NEW.starts
  );
END;
--> statement-breakpoint
CREATE TRIGGER room_closures_stay_overlap_update
BEFORE UPDATE OF starts, ends ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'closure overlaps stay')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND r.status IN ('confirmed', 'checked_in', 'checked_out')
      AND r.check_in < NEW.ends
      AND r.check_out > NEW.starts
  );
END;
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
      AND r.status IN ('confirmed', 'checked_in', 'checked_out')
      AND r.check_out > date('now')
  );
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    SELECT 1 FROM (
      SELECT CASE WHEN r.check_in > date('now') THEN r.check_in ELSE date('now') END AS d
      FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = OLD.room_type_id
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_out > date('now')
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
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_in <= nights.d
        AND r.check_out > nights.d
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
