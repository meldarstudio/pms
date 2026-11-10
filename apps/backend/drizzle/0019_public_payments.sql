CREATE TABLE `operation_controls` (
	`id` integer PRIMARY KEY NOT NULL,
	`public_payments_admitted` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "operation_controls_singleton" CHECK("operation_controls"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD `checkout_id` text REFERENCES public_checkouts(id);--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD `acceptance_id` text REFERENCES checkout_acceptances(id);--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD `language` text;--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD `confirmation_email_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `payment_attempts_checkout` ON `payment_attempts` (`checkout_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `reservations` ADD `public_checkout_id` text REFERENCES public_checkouts(id);