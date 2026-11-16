CREATE TABLE `payment_voids` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`voided_at` text NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
