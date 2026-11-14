CREATE TRIGGER complaint_attachments_no_update BEFORE UPDATE ON complaint_attachments BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER complaint_attachments_no_delete BEFORE DELETE ON complaint_attachments BEGIN SELECT RAISE(ABORT, 'filed complaint records are immutable'); END;
--> statement-breakpoint
