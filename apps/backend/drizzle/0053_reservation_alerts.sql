CREATE TABLE `reservation_alert_deliveries` (
	`reservation_id` text NOT NULL,
	`device_id` text NOT NULL,
	`check_in` text NOT NULL,
	`next_attempt_at` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`reservation_id`, `device_id`),
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `reservation_alert_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reservation_alert_deliveries_device` ON `reservation_alert_deliveries` (`device_id`);--> statement-breakpoint
CREATE INDEX `reservation_alert_deliveries_due` ON `reservation_alert_deliveries` (`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `reservation_alert_deliveries_expiry` ON `reservation_alert_deliveries` (`expires_at`);--> statement-breakpoint
CREATE TABLE `reservation_alert_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`portal_origin` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_alert_devices_endpoint_unique` ON `reservation_alert_devices` (`endpoint`);--> statement-breakpoint
CREATE INDEX `reservation_alert_devices_account` ON `reservation_alert_devices` (`account_id`);