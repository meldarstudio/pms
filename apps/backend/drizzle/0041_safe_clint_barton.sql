CREATE TABLE `complaint_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`uploaded_by` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `complaint_responses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `complaint_attachments_response` ON `complaint_attachments` (`response_id`);