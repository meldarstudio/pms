ALTER TABLE `reservations` ADD `rate_plan` text DEFAULT 'flexible' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `cancellation_charge_basis` text DEFAULT 'first_night' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `free_cancellation_hours` integer DEFAULT 48;--> statement-breakpoint
ALTER TABLE `reservations` ADD `check_in_time` text DEFAULT '15:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `payment_schedule` text DEFAULT 'first_night_deposit' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `price_adjustment_percent` integer DEFAULT 0 NOT NULL;