CREATE TRIGGER payments_no_update BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT, 'saved payments are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER payment_voids_no_update BEFORE UPDATE ON payment_voids BEGIN SELECT RAISE(ABORT, 'saved payments are immutable'); END;
