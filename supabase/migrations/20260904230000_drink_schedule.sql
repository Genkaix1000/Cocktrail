-- Vigencia horaria de promos / tragos.

ALTER TABLE drinks
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_from TEXT,
  ADD COLUMN IF NOT EXISTS schedule_until TEXT,
  ADD COLUMN IF NOT EXISTS schedule_hide_when_expired BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_move_to_category_id TEXT,
  ADD COLUMN IF NOT EXISTS schedule_repeat_next_event BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_consumed BOOLEAN NOT NULL DEFAULT false;
