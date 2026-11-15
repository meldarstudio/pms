CREATE TABLE `complaint_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`complaint_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`pending_request` text,
	`provider_message_id` text,
	`last_error` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`retry_request_id` text,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaint_sheets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `complaint_receipt_email` ON `complaint_emails` (`complaint_id`);--> statement-breakpoint
CREATE INDEX `complaint_emails_due` ON `complaint_emails` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `complaint_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`complaint_id` text NOT NULL,
	`payload` text NOT NULL,
	`text` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`sent_at` text NOT NULL,
	`evidence` text NOT NULL,
	`corrects_id` text,
	`recorded_at` text NOT NULL,
	`recorded_by` text NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaint_sheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `complaint_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text,
	`request_payload` text NOT NULL,
	`book_id` text NOT NULL,
	`number` integer NOT NULL,
	`reference` text NOT NULL,
	`establishment_id` text NOT NULL,
	`provider` text NOT NULL,
	`input` text NOT NULL,
	`currency` text NOT NULL,
	`time_zone` text NOT NULL,
	`filed_at` text NOT NULL,
	`registered_at` text NOT NULL,
	`due_date` text NOT NULL,
	`calendar_source` text NOT NULL,
	`policy` text NOT NULL,
	`source` text NOT NULL,
	`original_reference` text,
	`restored_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `complaint_sheets_token_hash_unique` ON `complaint_sheets` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `complaint_sheets_reference_unique` ON `complaint_sheets` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `complaint_sheets_original_reference_unique` ON `complaint_sheets` (`original_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `complaint_book_number` ON `complaint_sheets` (`book_id`,`number`);