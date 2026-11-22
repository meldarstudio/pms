-- public_checkouts.room_type_id has a foreign key, so the table is rebuilt. Quotes, acceptances,
-- payment attempts and reservations reference it: the copy is reinserted under the table's own
-- name so their deferred references resolve before the migration's transaction commits.
PRAGMA defer_foreign_keys = ON;--> statement-breakpoint
CREATE TABLE `__old_public_checkouts` AS SELECT "id", "token_hash", "check_in", "check_out", "rooms", "rate_plan", "language", "created_at", "reserved_once" FROM `public_checkouts`;--> statement-breakpoint
DROP TABLE `public_checkouts`;--> statement-breakpoint
CREATE TABLE `public_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`rooms` text DEFAULT '[]' NOT NULL,
	`rate_plan` text NOT NULL,
	`language` text NOT NULL,
	`created_at` text NOT NULL,
	`reserved_once` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `public_checkouts`("id", "token_hash", "check_in", "check_out", "rooms", "rate_plan", "language", "created_at", "reserved_once") SELECT "id", "token_hash", "check_in", "check_out", "rooms", "rate_plan", "language", "created_at", "reserved_once" FROM `__old_public_checkouts`;--> statement-breakpoint
DROP TABLE `__old_public_checkouts`;--> statement-breakpoint
CREATE UNIQUE INDEX `public_checkouts_token_hash_unique` ON `public_checkouts` (`token_hash`);--> statement-breakpoint
CREATE INDEX `public_checkouts_never_reserved_age` ON `public_checkouts` (`created_at`) WHERE "public_checkouts"."reserved_once" = 0;--> statement-breakpoint
ALTER TABLE `quotes` DROP COLUMN `room_type_id`;--> statement-breakpoint
ALTER TABLE `quotes` DROP COLUMN `adults`;--> statement-breakpoint
ALTER TABLE `quotes` DROP COLUMN `children`;--> statement-breakpoint
ALTER TABLE `quotes` DROP COLUMN `nights`;
