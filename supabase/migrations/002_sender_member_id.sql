-- ============================================================
-- Migration: Add sender_member_id to messages
-- This links each message to a room_member record instead of
-- only a session_id, so is_own stays correct even if the user
-- rejoins with a different username or new session.
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_member_id UUID REFERENCES room_members(id) ON DELETE SET NULL;

-- Index for fast member-based lookups
CREATE INDEX IF NOT EXISTS idx_messages_sender_member_id
  ON messages (sender_member_id)
  WHERE sender_member_id IS NOT NULL;
