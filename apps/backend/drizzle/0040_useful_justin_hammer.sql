ALTER TABLE `complaint_emails` ADD `first_attempt_at` text;--> statement-breakpoint
ALTER TABLE `complaint_emails` ADD `delivery_uncertain` integer DEFAULT false NOT NULL;