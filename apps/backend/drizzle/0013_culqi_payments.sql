CREATE TABLE `payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`email` text NOT NULL,
	`guest` text NOT NULL,
	`source_id` text NOT NULL,
	`device_fingerprint` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`called_at` text NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`culqi_charge_id` text,
	`reservation_id` text,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_attempts_status` ON `payment_attempts` (`status`,`called_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_open` ON `payment_attempts` (`quote_id`) WHERE "payment_attempts"."status" IN ('unknown', 'review', 'succeeded', 'saved');--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_charge` ON `payment_attempts` (`culqi_charge_id`);--> statement-breakpoint
ALTER TABLE `payments` ADD `culqi_charge_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_culqi_charge` ON `payments` (`culqi_charge_id`);--> statement-breakpoint
ALTER TABLE `refunds` ADD `culqi_charge_id` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `culqi_refund_id` text;