-- Migration: Add user_prompt column to quotes table
-- Persists the instruction/AI notes text so it survives page reloads
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS user_prompt TEXT;
