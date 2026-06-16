ALTER TABLE claude_briefs
ADD COLUMN focused_catalyst_json TEXT;

ALTER TABLE claude_briefs
ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_claude_briefs_generated_at
ON claude_briefs(generated_at);

CREATE INDEX IF NOT EXISTS idx_source_references_created_at
ON source_references(created_at);
