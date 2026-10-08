DROP TRIGGER IF EXISTS rooms_out_of_order;
--> statement-breakpoint
DROP TRIGGER IF EXISTS room_closures_out_of_order_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_type_capacity_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_type_capacity_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservations_dates_capacity;
--> statement-breakpoint
DROP TRIGGER IF EXISTS room_closures_capacity_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS room_closures_capacity_update;
--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `status`;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_type_capacity_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = NEW.room_type_id
  ) <= (
    SELECT COUNT(*) FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_type_id = NEW.room_type_id
      AND rr.status NOT IN ('cancelled', 'no_show')
      AND r.check_in < nr.check_out
      AND r.check_out > nr.check_in
  ) + (
    SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
    JOIN rooms rm ON rm.id = c.room_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rm.room_type_id = NEW.room_type_id
      AND c.starts < nr.check_out
      AND c.ends > nr.check_in
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_type_capacity_update
BEFORE UPDATE OF room_type_id, status ON reservation_rooms
WHEN NEW.status NOT IN ('cancelled', 'no_show')
  AND (OLD.status IN ('cancelled', 'no_show') OR NEW.room_type_id != OLD.room_type_id)
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = NEW.room_type_id
  ) <= (
    SELECT COUNT(*) FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_type_id = NEW.room_type_id
      AND rr.id != NEW.id
      AND rr.status NOT IN ('cancelled', 'no_show')
      AND r.check_in < nr.check_out
      AND r.check_out > nr.check_in
  ) + (
    SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
    JOIN rooms rm ON rm.id = c.room_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rm.room_type_id = NEW.room_type_id
      AND c.starts < nr.check_out
      AND c.ends > nr.check_in
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservations_dates_capacity
BEFORE UPDATE OF check_in, check_out ON reservations
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms line
    WHERE line.reservation_id = NEW.id
      AND line.status NOT IN ('cancelled', 'no_show')
      AND (
        SELECT COUNT(*) FROM rooms
        WHERE room_type_id = line.room_type_id
      ) <= (
        SELECT COUNT(*) FROM reservation_rooms rr
        JOIN reservations r ON r.id = rr.reservation_id
        WHERE rr.room_type_id = line.room_type_id
          AND rr.id != line.id
          AND rr.status NOT IN ('cancelled', 'no_show')
          AND (
            rr.reservation_id = NEW.id
            OR (r.check_in < NEW.check_out AND r.check_out > NEW.check_in)
          )
      ) + (
        SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
        JOIN rooms rm ON rm.id = c.room_id
        WHERE rm.room_type_id = line.room_type_id
          AND c.starts < NEW.check_out
          AND c.ends > NEW.check_in
      )
  );
END;
--> statement-breakpoint
CREATE TRIGGER room_closures_capacity_insert
BEFORE INSERT ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = (SELECT room_type_id FROM rooms WHERE id = NEW.room_id)
  ) <= (
    SELECT COUNT(*) FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN rooms target ON target.id = NEW.room_id
    WHERE rr.room_type_id = target.room_type_id
      AND rr.status NOT IN ('cancelled', 'no_show')
      AND r.check_in < NEW.ends
      AND r.check_out > NEW.starts
  ) + (
    SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
    JOIN rooms rm ON rm.id = c.room_id
    JOIN rooms target ON target.id = NEW.room_id
    WHERE rm.room_type_id = target.room_type_id
      AND c.starts < NEW.ends
      AND c.ends > NEW.starts
  );
END;
--> statement-breakpoint
CREATE TRIGGER room_closures_capacity_update
BEFORE UPDATE OF starts, ends ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = (SELECT room_type_id FROM rooms WHERE id = NEW.room_id)
  ) <= (
    SELECT COUNT(*) FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN rooms target ON target.id = NEW.room_id
    WHERE rr.room_type_id = target.room_type_id
      AND rr.status NOT IN ('cancelled', 'no_show')
      AND r.check_in < NEW.ends
      AND r.check_out > NEW.starts
  ) + (
    SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
    JOIN rooms rm ON rm.id = c.room_id
    JOIN rooms target ON target.id = NEW.room_id
    WHERE c.id != NEW.id
      AND rm.room_type_id = target.room_type_id
      AND c.starts < NEW.ends
      AND c.ends > NEW.starts
  );
END;
