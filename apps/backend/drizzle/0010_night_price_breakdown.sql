ALTER TABLE `reservation_room_nights` ADD `adjustment_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reservation_room_nights` ADD `discount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Price and discount are checked on write only, so saved rows are never revalidated.
CREATE TRIGGER reservation_room_nights_price_insert
BEFORE INSERT ON reservation_room_nights
BEGIN
  SELECT RAISE(ABORT, 'invalid night price') WHERE NEW.price_cents < 0 OR NEW.discount_cents < 0;
END;
--> statement-breakpoint
CREATE TRIGGER reservation_room_nights_price_update
BEFORE UPDATE OF price_cents, discount_cents ON reservation_room_nights
BEGIN
  SELECT RAISE(ABORT, 'invalid night price') WHERE NEW.price_cents < 0 OR NEW.discount_cents < 0;
END;
