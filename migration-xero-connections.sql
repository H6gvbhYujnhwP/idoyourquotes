-- Delivery 2.11 — Xero connection storage.
--
-- Creates one table. Additive, IF NOT EXISTS throughout, idempotent,
-- safe to re-run. No existing table or column is touched.
--
-- RUN BEFORE DEPLOYING THE CODE. The Settings page calls xero.status on
-- load; without the table that query errors.
--
-- Run in the Render shell:
--   echo go; psql $DATABASE_URL -f migration-xero-connections.sql
--
-- ONE ROW PER ORGANISATION. The unique index on org_id is the guarantee
-- behind that, not just an optimisation: two rows would mean two sets of
-- rotating refresh tokens for the same organisation, and whichever was
-- written second would silently invalidate the first.
--
-- TOKENS ARE CIPHERTEXT. access_token and refresh_token hold AES-256-GCM
-- ciphertext produced by server/services/xeroTokens.ts, not tokens. They
-- are text rather than bytea because the stored form is a hex string
-- with a version prefix, which is easier to inspect and to migrate.
--
-- ROLLBACK (removes the connection; users simply reconnect):
--   DROP TABLE IF EXISTS xero_connections;

BEGIN;

CREATE TABLE IF NOT EXISTS xero_connections (
  id                    bigserial PRIMARY KEY,
  org_id                bigint      NOT NULL,
  tenant_id             varchar(64) NOT NULL,
  tenant_name           varchar(255),
  access_token          text        NOT NULL,
  refresh_token         text        NOT NULL,
  expires_at            timestamp   NOT NULL,
  scopes                text,
  sales_tax_type        varchar(32),
  tax_rates             json,
  connected_by_user_id  bigint,
  connected_at          timestamp   NOT NULL DEFAULT now(),
  created_at            timestamp   NOT NULL DEFAULT now(),
  updated_at            timestamp   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS xero_connections_org_idx
  ON xero_connections (org_id);

COMMIT;

-- VERIFY (should list 13 columns):
--   \d xero_connections
--
-- VERIFY the unique index exists (should return one row):
--   SELECT indexname FROM pg_indexes WHERE indexname = 'xero_connections_org_idx';
--
-- After connecting from Settings, this should return exactly one row,
-- with ciphertext in the token columns rather than anything readable:
--   SELECT org_id, tenant_name, sales_tax_type, expires_at,
--          left(access_token, 12) AS token_prefix
--   FROM xero_connections;
