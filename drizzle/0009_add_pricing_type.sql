-- Migration: Add pricing_type to catalog_items and quote_line_items
-- Supports Standard (default, included in total), Monthly (recurring), Optional (not in total)

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'standard';
ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'standard';
