CREATE TABLE `reservation_guests` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`reservation_room_id` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text,
	`document_type` text,
	`document_number` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_room_id`) REFERENCES `reservation_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reservation_guests_reservation` ON `reservation_guests` (`reservation_id`);--> statement-breakpoint
ALTER TABLE `financial_entries` ADD `payment_date` text;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD `reference` text;