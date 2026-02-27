-- Migration: Add contact_name to quotes table
-- Separates contact person name from client/company name
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
