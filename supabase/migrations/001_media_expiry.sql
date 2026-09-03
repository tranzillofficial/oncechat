-- Migration: Add media expiry and one-time-view support to messages
-- Run this in the Supabase SQL Editor

-- 1. Add expires_at: media auto-deletes after 48 hours (NULL = never expires / preserved by admin)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add one_time_view: if true, image is hidden after 30s from the recipient's first reveal
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS one_time_view BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add viewed_at: tracks when the recipient first revealed a one-time-view image
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Add admin_preserved: admin can mark media to never be auto-deleted
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS admin_preserved BOOLEAN NOT NULL DEFAULT FALSE;

-- 5. Index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON messages (expires_at)
  WHERE expires_at IS NOT NULL AND admin_preserved = FALSE;

-- 6. Stored function that deletes expired media files and message storage_paths
--    Called by pg_cron every hour (see below).
--    It clears storage_path on the message row; the actual bucket object deletion
--    is handled by the Next.js /api/media/delete-expired cron route.
CREATE OR REPLACE FUNCTION cleanup_expired_media()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Null out storage_path for expired, non-preserved messages
  UPDATE messages
  SET storage_path = NULL
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND admin_preserved = FALSE
    AND storage_path IS NOT NULL;
END;
$$;

-- 7. Schedule cleanup every hour using pg_cron (enable pg_cron extension first in Supabase dashboard)
-- SELECT cron.schedule('cleanup-expired-media', '0 * * * *', 'SELECT cleanup_expired_media()');
-- Uncomment the line above after enabling pg_cron in your Supabase project.
