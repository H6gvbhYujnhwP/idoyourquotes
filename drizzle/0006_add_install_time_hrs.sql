-- Migration: Add install_time_hrs to catalog_items
-- Stores the typical installation time per item in hours
-- Used to auto-calculate labour costs per material in the Quote Draft Summary

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS install_time_hrs DECIMAL(6, 2);
