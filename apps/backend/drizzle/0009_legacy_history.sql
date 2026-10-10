-- Shared dates at migration time are the last surviving dates, not necessarily
-- the original booked dates. Keep unavailable history explicitly unknown.
UPDATE reservation_rooms SET original_check_in = NULL, original_check_out = NULL
WHERE original_nights IS NULL;
--> statement-breakpoint
-- Keep the original recorded legacy discount, but never reactivate discounts
-- from rooms that were already cancelled before the workflow migration.
UPDATE financial_entries SET
 kind = CASE WHEN (SELECT status FROM reservation_rooms WHERE 'legacy-discount-' || id = financial_entries.id) = 'cancelled' THEN 'legacy_discount_excluded' ELSE 'discount' END,
 amount_cents = (SELECT discount_cents FROM reservation_rooms WHERE 'legacy-discount-' || id = financial_entries.id)
WHERE legacy = 1 AND id LIKE 'legacy-discount-%';
