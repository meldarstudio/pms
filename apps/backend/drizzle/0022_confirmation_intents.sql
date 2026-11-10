CREATE TABLE `confirmation_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`checkout_id` text NOT NULL,
	`acceptance_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`language` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attempt_id`) REFERENCES `payment_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checkout_id`) REFERENCES `public_checkouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acceptance_id`) REFERENCES `checkout_acceptances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_intents_reservation_id_unique` ON `confirmation_intents` (`reservation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_intents_attempt_id_unique` ON `confirmation_intents` (`attempt_id`);--> statement-breakpoint
ALTER TABLE `reservations` ADD `confirmation_owed` integer DEFAULT 0 NOT NULL;