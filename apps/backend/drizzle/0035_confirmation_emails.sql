CREATE TABLE `confirmation_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`recipient` text NOT NULL,
	`language` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`provider_message_id` text,
	`last_error` text,
	`requested_by` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "confirmation_emails_kind" CHECK("confirmation_emails"."kind" IN ('automatic', 'resend')),
	CONSTRAINT "confirmation_emails_status" CHECK("confirmation_emails"."status" IN ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_emails_automatic` ON `confirmation_emails` (`reservation_id`) WHERE "confirmation_emails"."kind" = 'automatic';--> statement-breakpoint
CREATE INDEX `confirmation_emails_reservation` ON `confirmation_emails` (`reservation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `confirmation_emails_due` ON `confirmation_emails` (`status`,`next_attempt_at`);--> statement-breakpoint
DROP TABLE `confirmation_reports`;--> statement-breakpoint
DROP TABLE `confirmation_submission_attempts`;--> statement-breakpoint
DROP TABLE `confirmation_submissions`;--> statement-breakpoint
DROP TABLE `confirmation_resends`;--> statement-breakpoint
DROP TABLE `confirmation_intents`;--> statement-breakpoint
ALTER TABLE `reservations` DROP COLUMN `confirmation_owed`;