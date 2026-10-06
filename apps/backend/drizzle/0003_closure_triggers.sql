DROP TRIGGER IF EXISTS reservation_rooms_type_capacity_insert;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_type_capacity_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = NEW.room_type_id AND status = 'in_service'
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
      AND rm.status = 'in_service'
      AND c.starts < nr.check_out
      AND c.ends > nr.check_in
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservation_rooms_type_capacity_update;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_type_capacity_update
BEFORE UPDATE OF room_type_id, status ON reservation_rooms
WHEN NEW.status NOT IN ('cancelled', 'no_show')
  AND (OLD.status IN ('cancelled', 'no_show') OR NEW.room_type_id != OLD.room_type_id)
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = NEW.room_type_id AND status = 'in_service'
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
      AND rm.status = 'in_service'
      AND c.starts < nr.check_out
      AND c.ends > nr.check_in
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reservations_dates_capacity;
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
        WHERE room_type_id = line.room_type_id AND status = 'in_service'
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
          AND rm.status = 'in_service'
          AND c.starts < NEW.check_out
          AND c.ends > NEW.check_in
      )
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_closure_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status NOT IN ('cancelled', 'no_show')
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
BEFORE UPDATE OF room_id ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status NOT IN ('cancelled', 'no_show')
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
CREATE TRIGGER reservations_dates_closure
BEFORE UPDATE OF check_in, check_out ON reservations
BEGIN
  SELECT RAISE(ABORT, 'room closed')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms line
    WHERE line.reservation_id = NEW.id
      AND line.room_id IS NOT NULL
      AND line.status NOT IN ('cancelled', 'no_show')
      AND EXISTS (
        SELECT 1 FROM room_closures c
        WHERE c.room_id = line.room_id
          AND c.starts < NEW.check_out
          AND c.ends > NEW.check_in
      )
  );
END;
--> statement-breakpoint
CREATE TRIGGER room_closures_out_of_order_insert
BEFORE INSERT ON room_closures
BEGIN
  SELECT RAISE(ABORT, 'room is out of order')
  WHERE EXISTS (
    SELECT 1 FROM rooms
    WHERE id = NEW.room_id AND status != 'in_service'
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
      AND rr.status NOT IN ('cancelled', 'no_show')
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
      AND rr.status NOT IN ('cancelled', 'no_show')
      AND r.check_in < NEW.ends
      AND r.check_out > NEW.starts
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
CREATE TRIGGER room_closures_capacity_insert
BEFORE INSERT ON room_closures
WHEN (SELECT status FROM rooms WHERE id = NEW.room_id) = 'in_service'
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = (SELECT room_type_id FROM rooms WHERE id = NEW.room_id)
      AND status = 'in_service'
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
      AND rm.status = 'in_service'
      AND c.starts < NEW.ends
      AND c.ends > NEW.starts
  );
END;
--> statement-breakpoint
CREATE TRIGGER room_closures_capacity_update
BEFORE UPDATE OF starts, ends ON room_closures
WHEN (SELECT status FROM rooms WHERE id = NEW.room_id) = 'in_service'
BEGIN
  SELECT RAISE(ABORT, 'no availability')
  WHERE (
    SELECT COUNT(*) FROM rooms
    WHERE room_type_id = (SELECT room_type_id FROM rooms WHERE id = NEW.room_id)
      AND status = 'in_service'
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
      AND rm.status = 'in_service'
      AND c.starts < NEW.ends
      AND c.ends > NEW.starts
  );
END;
