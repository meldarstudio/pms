CREATE TABLE `cancellation_waivers` (
	`id` text PRIMARY KEY NOT NULL,
	`cancellation_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text NOT NULL,
	`recorded_at` text NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`cancellation_id`) REFERENCES `reservation_cancellations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cancellation_waivers_amount" CHECK("cancellation_waivers"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `cancellation_waivers_cancellation` ON `cancellation_waivers` (`cancellation_id`);--> statement-breakpoint
CREATE TABLE `reservation_cancellations` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`free_until` text,
	`policy_charge_cents` integer NOT NULL,
	`account_id` text NOT NULL,
	`restored_at` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservation_cancellations_charge" CHECK("reservation_cancellations"."policy_charge_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_cancellations_active` ON `reservation_cancellations` (`reservation_id`) WHERE "reservation_cancellations"."restored_at" IS NULL;