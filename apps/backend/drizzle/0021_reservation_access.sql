CREATE TABLE `reservation_access` (
	`reservation_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`token` text NOT NULL,
	`expires_on` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_access_token_hash_unique` ON `reservation_access` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_access_token_unique` ON `reservation_access` (`token`);