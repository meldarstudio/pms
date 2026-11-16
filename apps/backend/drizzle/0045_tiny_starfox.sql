CREATE TABLE `complaint_response_voids` (
	`response_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`voided_at` text NOT NULL,
	`voided_by` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `complaint_responses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `complaint_notes`;