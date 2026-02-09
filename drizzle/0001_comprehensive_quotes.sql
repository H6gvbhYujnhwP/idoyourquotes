-- Migration: Add comprehensive quote fields
-- PostgreSQL 16 compatible syntax
-- Safe to re-run with IF NOT EXISTS / DO $$ BEGIN...END $$

-- Add comprehensive quote enum (PostgreSQL syntax)
DO $$ BEGIN
  CREATE TYPE quote_mode AS ENUM ('simple', 'comprehensive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add columns to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS quote_mode quote_mode DEFAULT 'simple' NOT NULL,
ADD COLUMN IF NOT EXISTS trade_preset VARCHAR(50),
ADD COLUMN IF NOT EXISTS comprehensive_config JSONB;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_mode ON quotes(quote_mode);
CREATE INDEX IF NOT EXISTS idx_quotes_preset ON quotes(trade_preset) WHERE trade_preset IS NOT NULL;

-- Add phase tracking to line items
ALTER TABLE quote_line_items
ADD COLUMN IF NOT EXISTS phase_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Create index for phase filtering
CREATE INDEX IF NOT EXISTS idx_line_items_phase ON quote_line_items(phase_id) WHERE phase_id IS NOT NULL;
