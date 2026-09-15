-- Existing plain-text notes remain readable. The existing organizer RLS applies.
ALTER TABLE workshop."OrganizerEntry" ADD COLUMN "richContent" jsonb;
