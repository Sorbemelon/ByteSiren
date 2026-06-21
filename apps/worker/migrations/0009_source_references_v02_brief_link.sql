-- Link v0.2 source references to claude_briefs_v02 without using the legacy
-- claude_briefs foreign key left on source_references_v02.brief_id.

ALTER TABLE source_references_v02
ADD COLUMN brief_v02_id TEXT;

CREATE INDEX IF NOT EXISTS idx_source_references_v02_brief_v02_id
ON source_references_v02(brief_v02_id);
