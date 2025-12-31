-- Migration: Add conversation history to sessions
-- Created: 2025-12-31

ALTER TABLE sessions ADD COLUMN conversation_history TEXT DEFAULT '[]';
