-- Add closed_by column to night_events table
ALTER TABLE night_events ADD COLUMN IF NOT EXISTS closed_by TEXT;
