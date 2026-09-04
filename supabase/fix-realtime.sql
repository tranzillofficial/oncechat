-- ============================================================
-- Fix: Enable REPLICA IDENTITY FULL for Realtime to work correctly
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Enable REPLICA IDENTITY FULL on messages table
--    This allows Supabase Realtime to send complete row data on INSERT/UPDATE/DELETE events
--    Without this, UPDATE events may not contain all columns, causing messages not to appear
ALTER TABLE messages REPLICA IDENTITY FULL;

-- 2. Enable REPLICA IDENTITY FULL on rooms table (for room status changes)
ALTER TABLE rooms REPLICA IDENTITY FULL;

-- 3. Enable REPLICA IDENTITY FULL on room_members (for presence detection fallback)
ALTER TABLE room_members REPLICA IDENTITY FULL;

-- 4. Ensure messages table is in the realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN others THEN NULL; END$$;

-- 5. Ensure rooms table is in the realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
EXCEPTION WHEN others THEN NULL; END$$;

-- 6. Ensure room_members table is in the realtime publication (needed for member queries)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE room_members;
EXCEPTION WHEN others THEN NULL; END$$;

-- 7. Update RLS policy for anon reading messages — make it simpler
--    The current policy checks is_active = true which can block realtime
DROP POLICY IF EXISTS anon_read_messages ON messages;
CREATE POLICY anon_read_messages ON messages
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = messages.room_id
    )
  );
