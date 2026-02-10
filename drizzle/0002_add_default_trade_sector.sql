-- Add default_trade_sector column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS default_trade_sector VARCHAR(50);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_trade_sector 
ON users(default_trade_sector) 
WHERE default_trade_sector IS NOT NULL;
