CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`document_type` text,
	`document_number` text,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`payment_date` text NOT NULL,
	`created_at` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_reservation` ON `payments` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `payments_date` ON `payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `reservation_guests` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`reservation_room_id` text,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`document_type` text,
	`document_number` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_room_id`) REFERENCES `reservation_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reservation_guests_reservation` ON `reservation_guests` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `reservation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reservation_room_nights` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_room_id` text NOT NULL,
	`date` text NOT NULL,
	`price_cents` integer NOT NULL,
	FOREIGN KEY (`reservation_room_id`) REFERENCES `reservation_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_room_nights_unique` ON `reservation_room_nights` (`reservation_room_id`,`date`);--> statement-breakpoint
CREATE TABLE `reservation_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`room_type_id` text NOT NULL,
	`room_id` text,
	`adults` integer NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reservation_rooms_reservation` ON `reservation_rooms` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `reservation_rooms_type` ON `reservation_rooms` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `reservation_rooms_room` ON `reservation_rooms` (`room_id`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`actual_arrival` text,
	`actual_departure` text,
	`cancellation_reason` text,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`cancelled_at` text,
	`guest_id` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`source` text DEFAULT 'desk' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_code_unique` ON `reservations` (`code`);--> statement-breakpoint
CREATE INDEX `reservations_dates` ON `reservations` (`check_in`,`check_out`);--> statement-breakpoint
CREATE INDEX `reservations_guest` ON `reservations` (`guest_id`);--> statement-breakpoint
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
CREATE INDEX `room_closures_room` ON `room_closures` (`room_id`,`starts`,`ends`);--> statement-breakpoint
CREATE TABLE `room_type_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`date` text NOT NULL,
	`price_cents` integer NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_type_rates_unique` ON `room_type_rates` (`room_type_id`,`date`);--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`max_occupancy` integer NOT NULL,
	`base_rate_cents` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_types_name_unique` ON `room_types` (`name`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`room_type_id` text NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_number_unique` ON `rooms` (`number`);