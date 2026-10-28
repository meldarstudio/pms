ALTER TABLE `reservations` ADD `free_cancellation_days` integer DEFAULT 2;--> statement-breakpoint
-- Accepted terms only ever held 48 hours (Flexible) or null (never free).
UPDATE `reservations` SET `free_cancellation_days` = `free_cancellation_hours` / 24;--> statement-breakpoint
-- Recorded deadlines were 15:00 on the deadline date in the property timezone, so
-- their UTC date is that date for any zone between UTC-9 and UTC+15, including Lima.
UPDATE `reservation_cancellations` SET `free_until` = substr(`free_until`, 1, 10) WHERE `free_until` IS NOT NULL;
