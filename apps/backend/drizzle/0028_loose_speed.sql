CREATE TABLE `confirmation_resends` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`language` text NOT NULL,
	`account_id` text NOT NULL,
	`account_username` text NOT NULL,
	`account_role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `reservation_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`intent_id`) REFERENCES `confirmation_intents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `confirmation_resends_intent` ON `confirmation_resends` (`intent_id`,`created_at`);