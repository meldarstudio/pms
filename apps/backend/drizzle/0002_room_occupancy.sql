ALTER TABLE `room_types` ADD `max_children` integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
DROP TRIGGER workflow_room_valid_insert;
--> statement-breakpoint
DROP TRIGGER workflow_room_valid_update;
--> statement-breakpoint
CREATE TRIGGER workflow_room_valid_insert BEFORE INSERT ON reservation_rooms BEGIN
  SELECT RAISE(ABORT, 'invalid room assignment') WHERE NEW.room_id IS NOT NULL AND NEW.room_type_id != (SELECT room_type_id FROM rooms WHERE id = NEW.room_id);
  SELECT RAISE(ABORT, 'invalid occupancy') WHERE NEW.adults < 1 OR NEW.children < 0
    OR NEW.adults > (SELECT max_occupancy FROM room_types WHERE id = NEW.room_type_id)
    OR NEW.children > (SELECT max_children FROM room_types WHERE id = NEW.room_type_id);
END;
--> statement-breakpoint
CREATE TRIGGER workflow_room_valid_update BEFORE UPDATE ON reservation_rooms BEGIN
  SELECT RAISE(ABORT, 'invalid room assignment') WHERE NEW.room_id IS NOT NULL AND NEW.room_type_id != (SELECT room_type_id FROM rooms WHERE id = NEW.room_id);
  SELECT RAISE(ABORT, 'invalid occupancy') WHERE NEW.adults < 1 OR NEW.children < 0
    OR NEW.adults > (SELECT max_occupancy FROM room_types WHERE id = NEW.room_type_id)
    OR NEW.children > (SELECT max_children FROM room_types WHERE id = NEW.room_type_id);
END;
