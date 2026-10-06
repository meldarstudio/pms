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
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_overlap_insert
BEFORE INSERT ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT RAISE(ABORT, 'room taken')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND rr.status NOT IN ('cancelled', 'no_show')
      AND r.check_in < nr.check_out
      AND r.check_out > nr.check_in
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservation_rooms_room_overlap_update
BEFORE UPDATE OF room_id ON reservation_rooms
WHEN NEW.room_id IS NOT NULL AND NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT RAISE(ABORT, 'room taken')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    JOIN reservations nr ON nr.id = NEW.reservation_id
    WHERE rr.room_id = NEW.room_id
      AND rr.id != NEW.id
      AND rr.status NOT IN ('cancelled', 'no_show')
      AND r.check_in < nr.check_out
      AND r.check_out > nr.check_in
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
      )
  );
END;
--> statement-breakpoint
CREATE TRIGGER reservations_dates_room
BEFORE UPDATE OF check_in, check_out ON reservations
BEGIN
  SELECT RAISE(ABORT, 'room taken')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms line
    WHERE line.reservation_id = NEW.id
      AND line.room_id IS NOT NULL
      AND line.status NOT IN ('cancelled', 'no_show')
      AND EXISTS (
        SELECT 1 FROM reservation_rooms rr
        JOIN reservations r ON r.id = rr.reservation_id
        WHERE rr.room_id = line.room_id
          AND rr.id != line.id
          AND rr.status NOT IN ('cancelled', 'no_show')
          AND (
            rr.reservation_id = NEW.id
            OR (r.check_in < NEW.check_out AND r.check_out > NEW.check_in)
          )
      )
  );
END;
--> statement-breakpoint
CREATE TRIGGER rooms_out_of_order
BEFORE UPDATE OF status ON rooms
WHEN NEW.status = 'out_of_order'
BEGIN
  SELECT RAISE(ABORT, 'room assigned')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    WHERE rr.room_id = NEW.id
      AND rr.status IN ('confirmed', 'checked_in')
      AND r.check_out >= date('now')
  );
END;
