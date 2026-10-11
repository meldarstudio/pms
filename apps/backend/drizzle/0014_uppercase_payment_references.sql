UPDATE financial_entries SET reference = upper(trim(reference)) WHERE reference IS NOT NULL;
--> statement-breakpoint
UPDATE payments SET reference = upper(trim(reference)) WHERE reference IS NOT NULL;
