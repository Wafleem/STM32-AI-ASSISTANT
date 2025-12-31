-- Migration: Create sessions table for tracking user sessions and pin allocations
-- Created: 2025-12-31

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  pin_allocations TEXT DEFAULT '{}',
  metadata TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_last_activity ON sessions(last_activity);
