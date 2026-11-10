CREATE TABLE `checkout_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`checkout_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`language` text NOT NULL,
	`accepted_at` text NOT NULL,
	FOREIGN KEY (`checkout_id`) REFERENCES `public_checkouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `checkout_acceptances_checkout` ON `checkout_acceptances` (`checkout_id`,`accepted_at`);--> statement-breakpoint
CREATE TABLE `public_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`room_type_id` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`adults` integer NOT NULL,
	`children` integer NOT NULL,
	`rate_plan` text NOT NULL,
	`language` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_checkouts_token_hash_unique` ON `public_checkouts` (`token_hash`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `checkout_id` text REFERENCES public_checkouts(id);--> statement-breakpoint
CREATE INDEX `quotes_checkout` ON `quotes` (`checkout_id`,`created_at`);