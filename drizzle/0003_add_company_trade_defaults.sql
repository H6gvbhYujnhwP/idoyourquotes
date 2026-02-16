-- Migration: Add trade-specific company defaults to organizations
-- These fields allow businesses to store their standard terms, rates, and exclusions
-- so the AI can use them when generating quotes instead of inventing values.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_working_hours_start VARCHAR(10) DEFAULT '08:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_working_hours_end VARCHAR(10) DEFAULT '16:30';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_working_days VARCHAR(100) DEFAULT 'Monday to Friday';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_insurance_limits JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_day_work_rates JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_exclusions TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_validity_days INTEGER DEFAULT 30;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_signatory_name VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_signatory_position VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_surface_treatment VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_return_visit_rate VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_payment_terms TEXT;
