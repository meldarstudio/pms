CREATE TRIGGER reservation_status_valid_insert BEFORE INSERT ON reservations
WHEN NEW.status NOT IN ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'unfulfilled') BEGIN
  SELECT RAISE(ABORT, 'invalid reservation status');
END;
--> statement-breakpoint
CREATE TRIGGER reservation_status_valid_update BEFORE UPDATE OF status ON reservations
WHEN NEW.status NOT IN ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'unfulfilled') BEGIN
  SELECT RAISE(ABORT, 'invalid reservation status');
END;
--> statement-breakpoint
CREATE TRIGGER payment_attempt_status_valid_insert BEFORE INSERT ON payment_attempts
WHEN NEW.status NOT IN ('unknown', 'review', 'failed', 'succeeded', 'saved') BEGIN
  SELECT RAISE(ABORT, 'invalid payment attempt status');
END;
--> statement-breakpoint
CREATE TRIGGER payment_attempt_status_valid_update BEFORE UPDATE OF status ON payment_attempts
WHEN NEW.status NOT IN ('unknown', 'review', 'failed', 'succeeded', 'saved') BEGIN
  SELECT RAISE(ABORT, 'invalid payment attempt status');
END;
