ALTER TABLE `public_checkouts` ADD `rooms` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `rooms` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `public_checkouts` SET `rooms` = json_array(json_object('roomTypeId', `room_type_id`, 'adults', `adults`, 'children', `children`));
--> statement-breakpoint
UPDATE `quotes` SET `rooms` = json_array(json_object('roomTypeId', `room_type_id`, 'adults', `adults`, 'children', `children`, 'nights', json(`nights`)));
