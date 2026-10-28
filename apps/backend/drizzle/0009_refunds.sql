CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`requested_at` text NOT NULL,
	`requested_account_id` text NOT NULL,
	`resolved_at` text,
	`resolved_account_id` text,
	`refund_date` text,
	`completion_reference` text,
	`failure_reason` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "refunds_amount" CHECK("refunds"."amount_cents" > 0),
	CONSTRAINT "refunds_outcome" CHECK(("refunds"."status" = 'requested' AND "refunds"."resolved_at" IS NULL AND "refunds"."resolved_account_id" IS NULL
          AND "refunds"."refund_date" IS NULL AND "refunds"."completion_reference" IS NULL AND "refunds"."failure_reason" IS NULL)
        OR ("refunds"."status" = 'completed' AND "refunds"."resolved_at" IS NOT NULL AND "refunds"."resolved_account_id" IS NOT NULL
          AND "refunds"."refund_date" IS NOT NULL AND "refunds"."completion_reference" IS NOT NULL AND "refunds"."failure_reason" IS NULL)
        OR ("refunds"."status" = 'failed' AND "refunds"."resolved_at" IS NOT NULL AND "refunds"."resolved_account_id" IS NOT NULL
          AND "refunds"."refund_date" IS NULL AND "refunds"."completion_reference" IS NULL AND "refunds"."failure_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `refunds_reservation` ON `refunds` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `refunds_payment` ON `refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `refunds_date` ON `refunds` (`refund_date`);