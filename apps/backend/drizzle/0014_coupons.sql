CREATE TABLE `coupon_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`recorded_at` text NOT NULL,
	`recorded_on` text NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "coupon_movements_amount" CHECK("coupon_movements"."amount_cents" > 0),
	CONSTRAINT "coupon_movements_kind" CHECK("coupon_movements"."kind" IN ('issue', 'redeem', 'return'))
);
--> statement-breakpoint
CREATE INDEX `coupon_movements_coupon` ON `coupon_movements` (`coupon_id`);--> statement-breakpoint
CREATE INDEX `coupon_movements_reservation` ON `coupon_movements` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `coupon_movements_date` ON `coupon_movements` (`recorded_on`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`code` text NOT NULL,
	`source_reservation_id` text NOT NULL,
	`value_cents` integer NOT NULL,
	`balance_cents` integer NOT NULL,
	`issued_at` text NOT NULL,
	`expires_on` text NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`source_reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "coupons_value" CHECK("coupons"."value_cents" > 0),
	CONSTRAINT "coupons_balance" CHECK("coupons"."balance_cents" >= 0 AND "coupons"."balance_cents" <= "coupons"."value_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE INDEX `coupons_source` ON `coupons` (`source_reservation_id`);