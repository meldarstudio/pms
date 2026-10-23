ALTER TABLE `rooms` ADD `housekeeping_status` text DEFAULT 'clean' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `housekeeping_changed_at` text;