CREATE TABLE `confirmation_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL,
	`send_key` text,
	`endpoint` text,
	`request_json` text,
	`recipient_email` text NOT NULL,
	`language` text NOT NULL,
	`first_possible_at` text,
	`status` text NOT NULL,
	`provider_message_id` text,
	`failure_code` text,
	`next_attempt_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`intent_id`) REFERENCES `confirmation_intents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "confirmation_submission_status" CHECK("confirmation_submissions"."status" in ('uncertain', 'accepted', 'unsent', 'attention'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_submissions_intent_id_unique` ON `confirmation_submissions` (`intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_submissions_send_key_unique` ON `confirmation_submissions` (`send_key`);--> statement-breakpoint
ALTER TABLE `operation_controls` ADD `email_submission_admitted` integer DEFAULT false NOT NULL;