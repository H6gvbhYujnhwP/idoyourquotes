-- Migration: Add 'pdf_generated' value to quote_status enum
-- Supports the new status auto-flip when a PDF is downloaded (PR-Beta will use this).
-- IF NOT EXISTS makes this idempotent — safe to re-run.
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'pdf_generated';
