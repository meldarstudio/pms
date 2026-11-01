DROP TRIGGER `reservation_guest_room_insert`;
--> statement-breakpoint
DROP TRIGGER `reservation_guest_room_update`;
--> statement-breakpoint
CREATE TABLE `__new_reservation_guests` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`document_type` text,
	`document_number` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_reservation_guests`("id", "reservation_id", "full_name", "email", "phone", "document_type", "document_number", "created_at") SELECT "id", "reservation_id", "full_name", "email", "phone", "document_type", "document_number", "created_at" FROM `reservation_guests`;--> statement-breakpoint
DROP TABLE `reservation_guests`;--> statement-breakpoint
ALTER TABLE `__new_reservation_guests` RENAME TO `reservation_guests`;--> statement-breakpoint
CREATE INDEX `reservation_guests_reservation` ON `reservation_guests` (`reservation_id`);
