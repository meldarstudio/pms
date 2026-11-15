CREATE TABLE `complaint_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`complaint_id` text NOT NULL,
	`payload` text NOT NULL,
	`text` text NOT NULL,
	`recorded_at` text NOT NULL,
	`recorded_by` text NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaint_sheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `complaint_notes_complaint` ON `complaint_notes` (`complaint_id`,`recorded_at`);--> statement-breakpoint
DROP INDEX `complaint_receipt_email`;--> statement-breakpoint
ALTER TABLE `complaint_emails` ADD `kind` text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE `complaint_emails` ADD `requested_by` text REFERENCES user(id);--> statement-breakpoint
CREATE UNIQUE INDEX `complaint_emails_automatic` ON `complaint_emails` (`complaint_id`) WHERE "complaint_emails"."kind" = 'automatic';--> statement-breakpoint
CREATE UNIQUE INDEX `complaint_emails_pending` ON `complaint_emails` (`complaint_id`) WHERE "complaint_emails"."status" = 'pending';