CREATE TRIGGER complaint_response_voids_no_update BEFORE UPDATE ON complaint_response_voids BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER complaint_response_voids_no_delete BEFORE DELETE ON complaint_response_voids BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
