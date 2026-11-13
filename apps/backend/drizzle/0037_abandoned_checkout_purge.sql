ALTER TABLE `public_checkouts` ADD `has_reservation` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `public_checkouts_unreserved_age` ON `public_checkouts` (`created_at`) WHERE "public_checkouts"."has_reservation" = 0;--> statement-breakpoint
CREATE INDEX `checkout_acceptances_quote` ON `checkout_acceptances` (`quote_id`);--> statement-breakpoint
CREATE INDEX `payment_attempts_quote` ON `payment_attempts` (`quote_id`);--> statement-breakpoint
CREATE INDEX `payment_attempts_acceptance` ON `payment_attempts` (`acceptance_id`);--> statement-breakpoint
CREATE INDEX `reservations_public_checkout` ON `reservations` (`public_checkout_id`);--> statement-breakpoint
UPDATE `public_checkouts` SET `has_reservation` = 1 WHERE `id` IN (SELECT `public_checkout_id` FROM `reservations` WHERE `public_checkout_id` IS NOT NULL);
--> statement-breakpoint
CREATE TRIGGER public_checkout_reserved_insert AFTER INSERT ON reservations WHEN NEW.public_checkout_id IS NOT NULL BEGIN
  UPDATE public_checkouts SET has_reservation = 1 WHERE id = NEW.public_checkout_id;
END;
--> statement-breakpoint
CREATE TRIGGER public_checkout_reserved_update AFTER UPDATE OF public_checkout_id ON reservations WHEN NEW.public_checkout_id IS NOT NULL BEGIN
  UPDATE public_checkouts SET has_reservation = 1 WHERE id = NEW.public_checkout_id;
END;
