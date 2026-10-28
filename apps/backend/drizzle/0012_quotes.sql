CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`adults` integer NOT NULL,
	`children` integer NOT NULL,
	`nights` text NOT NULL,
	`terms` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `reservations` ADD `quote_id` text REFERENCES quotes(id);--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_quote` ON `reservations` (`quote_id`);