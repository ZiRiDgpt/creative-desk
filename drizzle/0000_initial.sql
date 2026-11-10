CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('new', 'work', 'review', 'changes', 'done')),
  buyer TEXT NOT NULL,
  assignee TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  brief TEXT NOT NULL,
  history TEXT NOT NULL,
  submissions TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  content BLOB NOT NULL
);
