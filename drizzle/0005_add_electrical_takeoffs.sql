-- Migration: Add electrical_takeoffs table
-- Stores AI-extracted symbol counts with coordinates from electrical drawings
-- Supports the verification workflow: extract → questions → verify → lock

CREATE TABLE IF NOT EXISTS electrical_takeoffs (
  id BIGSERIAL PRIMARY KEY,
  quote_id BIGINT NOT NULL,
  input_id BIGINT NOT NULL,
  drawing_ref VARCHAR(255),
  status VARCHAR(20) DEFAULT 'draft' NOT NULL,
  
  -- Extraction results (stored as JSONB for flexibility)
  page_width DECIMAL(10, 2),
  page_height DECIMAL(10, 2),
  symbols JSONB DEFAULT '[]'::jsonb,
  counts JSONB DEFAULT '{}'::jsonb,
  questions JSONB DEFAULT '[]'::jsonb,
  user_answers JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  drawing_notes TEXT[] DEFAULT '{}',
  db_circuits TEXT[] DEFAULT '{}',
  has_text_layer BOOLEAN DEFAULT true,
  total_text_elements INTEGER DEFAULT 0,
  
  -- Markup
  svg_overlay TEXT,
  markup_image_url TEXT,
  
  -- Audit
  verified_at TIMESTAMP,
  verified_by BIGINT,
  revision INTEGER DEFAULT 1,
  
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for fast lookups by quote
CREATE INDEX IF NOT EXISTS idx_electrical_takeoffs_quote_id ON electrical_takeoffs(quote_id);
CREATE INDEX IF NOT EXISTS idx_electrical_takeoffs_input_id ON electrical_takeoffs(input_id);
