CREATE TABLE `financial_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`applied_cents` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`method` text,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text,
	`correction_reason` text,
	`replaces_id` text,
	`legacy` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `financial_reservation` ON `financial_entries` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `reservation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_reservation` ON `reservation_events` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `reservation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`expected_version` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `check_in` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `check_out` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `original_check_in` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `original_check_out` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `actual_arrival` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `actual_departure` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `assignment_start` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `cancellation_reason` text;--> statement-breakpoint
ALTER TABLE `reservation_rooms` ADD `original_nights` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `cancelled_at` text;