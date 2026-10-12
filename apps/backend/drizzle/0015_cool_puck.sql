ALTER TABLE `reservations` ADD `discount_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE reservations
SET discount_cents = COALESCE(
  (
    SELECT SUM(amount_cents)
    FROM financial_entries
    WHERE financial_entries.reservation_id = reservations.id
      AND financial_entries.kind = 'discount'
      AND financial_entries.voided_at IS NULL
  ),
  0
);
--> statement-breakpoint
DELETE FROM financial_entries WHERE kind = 'discount';
