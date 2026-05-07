-- Phase 4B Delivery E.13 — Customer support bot.
--
-- Two new tables back the in-app support widget and the admin
-- Conversations view:
--
--   support_threads — one row per conversation. Lifecycle:
--     open → escalated (user pressed Email support, or bot suggested it
--     and user confirmed) → resolved (admin marked done from the back-
--     office). Stays org-scoped via org_id; created_by_user_id tracks
--     the individual member who started the chat (relevant on Team).
--     Escalation contact details (name / business / email / phone /
--     summary) are captured at escalate-time and stored on the row so
--     the admin view shows them without having to chase the user
--     record.
--
--   support_messages — append-only message log. role is "user" or
--     "assistant". The optional helpful flag captures the per-message
--     thumbs-up signal — useful for tuning the knowledge document
--     after a few weeks of real traffic.
--
-- Run on the Render shell (psql) with the `echo go;` prefix per the
-- session rule. Then mirror the additions to shared/schema.ts and
-- drizzle/schema.ts.

-- ── Enums ─────────────────────────────────────────────────────────
CREATE TYPE support_thread_status AS ENUM ('open', 'escalated', 'resolved');
CREATE TYPE support_message_role AS ENUM ('user', 'assistant');

-- ── support_threads ───────────────────────────────────────────────
CREATE TABLE support_threads (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  status support_thread_status NOT NULL DEFAULT 'open',

  -- Page the user was on when they opened the drawer. Persisted on
  -- thread create and updated whenever a new message comes in from a
  -- different page (lets us see if they were navigating during the
  -- conversation).
  start_page_path TEXT,
  last_page_path TEXT,

  -- Bot-drafted summary of the thread, written into the row at
  -- escalate-time and editable by the user before they submit the
  -- form. Used as the email subject suffix.
  summary TEXT,

  -- Captured at escalate-time. Defaults pulled from the user/org
  -- records but the user can edit before submitting.
  escalation_contact_name VARCHAR(255),
  escalation_business_name VARCHAR(255),
  escalation_email VARCHAR(320),
  escalation_phone VARCHAR(50),

  escalated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by_user_id BIGINT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_threads_org_id ON support_threads(org_id);
CREATE INDEX idx_support_threads_user_id ON support_threads(user_id);
CREATE INDEX idx_support_threads_status ON support_threads(status);
CREATE INDEX idx_support_threads_updated_at ON support_threads(updated_at DESC);

-- ── support_messages ──────────────────────────────────────────────
CREATE TABLE support_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  role support_message_role NOT NULL,
  content TEXT NOT NULL,

  -- Per-message thumbs-up. NULL = not rated. TRUE = user clicked
  -- "This helped". FALSE reserved for a future thumbs-down if we add
  -- one; for now the absence of a click stays NULL.
  helpful BOOLEAN,

  -- Token usage for cost accounting on assistant messages. NULL on
  -- user messages.
  input_tokens INTEGER,
  output_tokens INTEGER,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_messages_thread_id ON support_messages(thread_id);
CREATE INDEX idx_support_messages_created_at ON support_messages(created_at);
