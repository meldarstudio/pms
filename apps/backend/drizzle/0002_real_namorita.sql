CREATE TABLE `room_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`starts` text NOT NULL,
	`ends` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_closures_room` ON `room_closures` (`room_id`,`starts`,`ends`);