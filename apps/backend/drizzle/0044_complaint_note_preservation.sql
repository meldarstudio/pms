CREATE TRIGGER complaint_notes_no_update BEFORE UPDATE ON complaint_notes BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER complaint_notes_no_delete BEFORE DELETE ON complaint_notes BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
