CREATE TABLE `rate_plan_price_adjustments` (
	`rate_plan` text PRIMARY KEY NOT NULL,
	`price_adjustment_percent` integer NOT NULL,
	CONSTRAINT "non_refundable_price_adjustment" CHECK("rate_plan_price_adjustments"."rate_plan" = 'non_refundable' AND typeof("rate_plan_price_adjustments"."price_adjustment_percent") = 'integer' AND "rate_plan_price_adjustments"."price_adjustment_percent" BETWEEN -99 AND -1)
);
