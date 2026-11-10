CREATE TABLE `confirmation_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`context` text NOT NULL,
	`event_id` text NOT NULL,
	`body_digest` text,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`message_id` text,
	`submission_tag` text,
	`recipient_email` text,
	`sender` text,
	`category` text,
	`occurred_at` text,
	`observed_at` text NOT NULL,
	`details` text,
	`submission_id` text,
	`conflict` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `confirmation_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_reports_event` ON `confirmation_reports` (`context`,`event_id`);--> statement-breakpoint
CREATE INDEX `confirmation_reports_message` ON `confirmation_reports` (`context`,`provider_message_id`);--> statement-breakpoint
CREATE INDEX `confirmation_reports_submission` ON `confirmation_reports` (`submission_id`);--> statement-breakpoint
CREATE INDEX `confirmation_reports_recipient` ON `confirmation_reports` (`context`,`recipient_email`);--> statement-breakpoint
ALTER TABLE `confirmation_submissions` ADD `report_conflict` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `confirmation_submissions` ADD `next_lookup_at` text;