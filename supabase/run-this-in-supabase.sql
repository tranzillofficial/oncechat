-- ============================================================
-- Ranchat: Run this entire file in Supabase SQL Editor
-- ============================================================

-- 1. Add missing columns to rooms
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Auto-update updated_at on rooms
CREATE OR REPLACE FUNCTION update_rooms_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_rooms_updated_at ON rooms;
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_rooms_updated_at();

-- 2. Add media expiry + one-time-view columns to messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS one_time_view BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_preserved BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON messages (expires_at)
  WHERE expires_at IS NOT NULL AND admin_preserved = FALSE;

-- 4. Partial unique index: same username cannot be active twice in same room
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_username_per_room
  ON room_members (room_id, username)
  WHERE is_active = TRUE;

-- 5. Trigger: max 2 active members per room
CREATE OR REPLACE FUNCTION check_room_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE active_count INT;
BEGIN
  IF NEW.is_active = TRUE THEN
    SELECT COUNT(*) INTO active_count
    FROM room_members
    WHERE room_id = NEW.room_id AND is_active = TRUE AND id != NEW.id;
    IF active_count >= 2 THEN
      RAISE EXCEPTION 'Room is full (max 2 active members)' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_check_room_capacity ON room_members;
CREATE TRIGGER trg_check_room_capacity
  BEFORE INSERT OR UPDATE ON room_members
  FOR EACH ROW EXECUTE FUNCTION check_room_capacity();

-- 6. RLS Policies
-- visitors: service_role has full access by default (bypasses RLS)
-- anon needs SELECT on rooms + room_members for join-page preflight

DROP POLICY IF EXISTS anon_read_rooms ON rooms;
CREATE POLICY anon_read_rooms ON rooms FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_room_members ON room_members;
CREATE POLICY anon_read_room_members ON room_members FOR SELECT TO anon USING (true);

-- 7. Create chat-media storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  FALSE,
  26214400, -- 25 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'audio/webm','audio/ogg','audio/mpeg','audio/mp3','audio/wav'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 8. RLS: allow anon to read messages in rooms they are active members of
DROP POLICY IF EXISTS anon_read_messages ON messages;
CREATE POLICY anon_read_messages ON messages
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = messages.room_id
        AND room_members.is_active = true
    )
  );

-- 9. Enable Realtime for messages and rooms (safe — ignores if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN others THEN NULL; END$$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
EXCEPTION WHEN others THEN NULL; END$$;
