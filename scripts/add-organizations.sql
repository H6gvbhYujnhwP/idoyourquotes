-- Add Organization Layer Migration
-- This script adds organizations, org_members, and usage_logs tables
-- and adds org_id columns to existing tables

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  company_address TEXT,
  company_phone VARCHAR(50),
  company_email VARCHAR(320),
  company_logo TEXT,
  default_terms TEXT,
  billing_email VARCHAR(320),
  stripe_customer_id VARCHAR(255),
  ai_credits_remaining INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create org_members table
CREATE TABLE IF NOT EXISTS org_members (
  id SERIAL PRIMARY KEY,
  org_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
  invited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create usage_logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id SERIAL PRIMARY KEY,
  org_id INT NOT NULL,
  user_id INT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  credits_used INT NOT NULL DEFAULT 1,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add org_id to quotes table (if not exists)
-- Note: Using a procedure to check if column exists first
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'quotes' 
  AND COLUMN_NAME = 'org_id'
);

-- Add org_id column if it doesn't exist
-- MySQL doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we use a workaround
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS org_id INT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by_user_id INT;

-- Add org_id to catalog_items table
ALTER TABLE catalogItems ADD COLUMN IF NOT EXISTS org_id INT;

-- Create tender_contexts table if not exists
CREATE TABLE IF NOT EXISTS tender_contexts (
  id SERIAL PRIMARY KEY,
  quote_id INT NOT NULL UNIQUE,
  symbol_mappings JSON,
  assumptions JSON,
  exclusions JSON,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create internal_estimates table if not exists
CREATE TABLE IF NOT EXISTS internal_estimates (
  id SERIAL PRIMARY KEY,
  quote_id INT NOT NULL UNIQUE,
  notes TEXT,
  cost_breakdown JSON,
  time_estimates JSON,
  risk_notes TEXT,
  ai_suggestions JSON,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
