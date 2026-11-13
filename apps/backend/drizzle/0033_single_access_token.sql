DROP INDEX `reservation_access_token_hash_unique`;--> statement-breakpoint
ALTER TABLE `reservation_access` DROP COLUMN `token_hash`;