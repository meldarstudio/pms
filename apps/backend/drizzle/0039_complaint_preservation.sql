CREATE TRIGGER complaint_sheets_no_update BEFORE UPDATE ON complaint_sheets BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER complaint_sheets_no_delete BEFORE DELETE ON complaint_sheets BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER complaint_responses_no_update BEFORE UPDATE ON complaint_responses BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER complaint_responses_no_delete BEFORE DELETE ON complaint_responses BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
