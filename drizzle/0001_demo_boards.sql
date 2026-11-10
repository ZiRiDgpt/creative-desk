ALTER TABLE tasks ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE sessions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE attachments ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX tasks_workspace_idx ON tasks (workspace_id, created_at);
CREATE INDEX attachments_workspace_idx ON attachments (workspace_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);
