CREATE TABLE `confirmation_submission_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`outcome` text,
	`failure_code` text,
	`provider_message_id` text,
	FOREIGN KEY (`submission_id`) REFERENCES `confirmation_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `confirmation_submission_attempts_submission` ON `confirmation_submission_attempts` (`submission_id`,`started_at`);--> statement-breakpoint
DROP INDEX `confirmation_submissions_intent_id_unique`;--> statement-breakpoint
ALTER TABLE `confirmation_submissions` ADD `deliberate_work_id` text REFERENCES confirmation_resends(id);--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_submissions_deliberate_work_id_unique` ON `confirmation_submissions` (`deliberate_work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_submission_original` ON `confirmation_submissions` (`intent_id`) WHERE "confirmation_submissions"."deliberate_work_id" IS NULL;