-- Add QDS summary JSON column to persist the full QuoteDraftData shape
-- This allows the QDS to be restored on page load without re-running AI analysis
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS qds_summary_json text;
