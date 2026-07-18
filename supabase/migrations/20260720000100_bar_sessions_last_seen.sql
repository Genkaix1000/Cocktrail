-- 20260718020000_bar_sessions_last_seen.sql
-- El backend espera last_seen_at para activity tracking. Se agregó nullable.

ALTER TABLE bar_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
