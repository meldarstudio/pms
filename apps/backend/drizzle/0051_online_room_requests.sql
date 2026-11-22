ALTER TABLE `public_checkouts` ADD `rooms` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `rooms` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `public_checkouts` SET `rooms` = json_array(json_object('roomTypeId', `room_type_id`, 'adults', `adults`, 'children', `children`));
--> statement-breakpoint
UPDATE `quotes` SET `rooms` = json_array(json_object('roomTypeId', `room_type_id`, 'adults', `adults`, 'children', `children`, 'nights', json(`nights`)));
--> statement-breakpoint
CREATE TRIGGER public_checkout_one_room_insert AFTER INSERT ON public_checkouts WHEN NEW.rooms = '[]' BEGIN
  UPDATE public_checkouts SET rooms = json_array(json_object('roomTypeId', NEW.room_type_id, 'adults', NEW.adults, 'children', NEW.children)) WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER quote_one_room_insert AFTER INSERT ON quotes WHEN NEW.rooms = '[]' BEGIN
  UPDATE quotes SET rooms = json_array(json_object('roomTypeId', NEW.room_type_id, 'adults', NEW.adults, 'children', NEW.children, 'nights', json(NEW.nights))) WHERE id = NEW.id;
END;
