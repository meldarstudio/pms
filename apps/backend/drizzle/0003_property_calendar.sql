CREATE TABLE `property_write_context` (
	`id` integer PRIMARY KEY NOT NULL,
	`property_date` text NOT NULL,
	CONSTRAINT "property_write_singleton" CHECK("property_write_context"."id" = 1)
);
--> statement-breakpoint
DROP TRIGGER rooms_type_change;
--> statement-breakpoint
CREATE TRIGGER rooms_type_change
BEFORE UPDATE OF room_type_id ON rooms
WHEN NEW.room_type_id != OLD.room_type_id
BEGIN
  SELECT RAISE(ABORT, 'property date context required')
  WHERE NOT EXISTS (SELECT 1 FROM property_write_context WHERE id = 1);
  SELECT RAISE(ABORT, 'room has an assigned stay')
  WHERE EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reservation_id
    WHERE rr.room_id = OLD.id
      AND r.status IN ('confirmed', 'checked_in', 'checked_out')
      AND r.check_out > (SELECT property_date FROM property_write_context WHERE id = 1)
  );
  SELECT RAISE(ABORT, 'no availability')
  WHERE EXISTS (
    SELECT 1 FROM (
      SELECT MAX(r.check_in, (SELECT property_date FROM property_write_context WHERE id = 1)) AS d
      FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = OLD.room_type_id
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_out > (SELECT property_date FROM property_write_context WHERE id = 1)
      UNION
      SELECT MAX(c.starts, (SELECT property_date FROM property_write_context WHERE id = 1))
      FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      WHERE rm.room_type_id = OLD.room_type_id
        AND c.room_id != OLD.id
        AND c.ends > (SELECT property_date FROM property_write_context WHERE id = 1)
    ) nights
    WHERE NOT EXISTS (
      SELECT 1 FROM room_closures mine
      WHERE mine.room_id = OLD.id AND mine.starts <= nights.d AND mine.ends > nights.d
    )
    AND (SELECT COUNT(*) FROM rooms WHERE room_type_id = OLD.room_type_id) <= (
      SELECT COUNT(*) FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.room_type_id = OLD.room_type_id
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.check_in <= nights.d AND r.check_out > nights.d
    ) + (
      SELECT COUNT(DISTINCT c.room_id) FROM room_closures c
      JOIN rooms rm ON rm.id = c.room_id
      WHERE rm.room_type_id = OLD.room_type_id AND c.room_id != OLD.id
        AND c.starts <= nights.d AND c.ends > nights.d
    )
  );
END;
