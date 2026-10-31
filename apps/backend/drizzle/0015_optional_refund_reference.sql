-- Rebuild refunds so a completed refund may omit its completion reference. D1 keeps
-- foreign keys enforced inside migrations; no table references refunds, and every copied
-- row keeps its existing reservation, payment and account references.
CREATE TABLE `__new_refunds` (
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
	`culqi_charge_id` text,
	`culqi_refund_id` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "refunds_amount" CHECK("__new_refunds"."amount_cents" > 0),
	CONSTRAINT "refunds_outcome" CHECK(("__new_refunds"."status" = 'requested' AND "__new_refunds"."resolved_at" IS NULL AND "__new_refunds"."resolved_account_id" IS NULL
          AND "__new_refunds"."refund_date" IS NULL AND "__new_refunds"."completion_reference" IS NULL AND "__new_refunds"."failure_reason" IS NULL)
        OR ("__new_refunds"."status" = 'completed' AND "__new_refunds"."resolved_at" IS NOT NULL AND "__new_refunds"."resolved_account_id" IS NOT NULL
          AND "__new_refunds"."refund_date" IS NOT NULL AND "__new_refunds"."failure_reason" IS NULL)
        OR ("__new_refunds"."status" = 'failed' AND "__new_refunds"."resolved_at" IS NOT NULL AND "__new_refunds"."resolved_account_id" IS NOT NULL
          AND "__new_refunds"."refund_date" IS NULL AND "__new_refunds"."completion_reference" IS NULL AND "__new_refunds"."failure_reason" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_refunds`("id", "reservation_id", "payment_id", "amount_cents", "method", "reference", "reason", "status", "requested_at", "requested_account_id", "resolved_at", "resolved_account_id", "refund_date", "completion_reference", "failure_reason", "culqi_charge_id", "culqi_refund_id") SELECT "id", "reservation_id", "payment_id", "amount_cents", "method", "reference", "reason", "status", "requested_at", "requested_account_id", "resolved_at", "resolved_account_id", "refund_date", "completion_reference", "failure_reason", "culqi_charge_id", "culqi_refund_id" FROM `refunds`;--> statement-breakpoint
DROP TABLE `refunds`;--> statement-breakpoint
ALTER TABLE `__new_refunds` RENAME TO `refunds`;--> statement-breakpoint
CREATE INDEX `refunds_reservation` ON `refunds` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `refunds_payment` ON `refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `refunds_date` ON `refunds` (`refund_date`);