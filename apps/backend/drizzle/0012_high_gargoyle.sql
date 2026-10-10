-- Preserve legacy name columns for historical data and imports. New APIs use full_name.
ALTER TABLE guests ADD COLUMN full_name text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE guests SET full_name = trim(first_name || ' ' || last_name);
--> statement-breakpoint
ALTER TABLE reservation_guests ADD COLUMN full_name text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE reservation_guests SET full_name = trim(first_name || ' ' || last_name);
