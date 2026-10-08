-- Supabase / PostgreSQL 15+. Run this file in the Supabase SQL Editor.
-- This creates an OPTIONAL destination; the app still uses SQLite on the VPS.
-- Running this SQL does NOT migrate or synchronize existing chat data.
-- The SQLite startup migration is chat-crm-storage.sqlite.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_crm_records (
  kind text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);

-- Private customer/chat data must not be readable through the public client API.
-- No client policies are created; trusted server access must enforce channel ACLs.
ALTER TABLE public.chat_crm_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_crm_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_crm_records TO service_role;

CREATE INDEX IF NOT EXISTS idx_chat_crm_messages_conversation_created
  ON public.chat_crm_records ((data ->> 'conversationId'), (data ->> 'createdAt'))
  WHERE kind = 'messages';
CREATE INDEX IF NOT EXISTS idx_chat_crm_records_customer
  ON public.chat_crm_records (kind, (data ->> 'customerId'));

CREATE OR REPLACE VIEW public.crm_customers WITH (security_invoker = true) AS
  SELECT id AS customer_id, data ->> 'name' AS name, version, updated_at
  FROM public.chat_crm_records WHERE kind = 'customers';
CREATE OR REPLACE VIEW public.crm_conversations WITH (security_invoker = true) AS
  SELECT id AS conversation_id, data ->> 'customerId' AS customer_id,
    data ->> 'connectionId' AS channel_id, data ->> 'deletedAt' AS deleted_at
  FROM public.chat_crm_records WHERE kind = 'conversations';
CREATE OR REPLACE VIEW public.crm_messages WITH (security_invoker = true) AS
  SELECT id AS message_id, data ->> 'conversationId' AS conversation_id,
    data ->> 'direction' AS direction, data ->> 'text' AS text,
    data ->> 'status' AS status, data ->> 'createdAt' AS created_at,
    data ->> 'deletedAt' AS deleted_at
  FROM public.chat_crm_records WHERE kind = 'messages';

REVOKE ALL ON public.crm_customers, public.crm_conversations, public.crm_messages
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crm_customers, public.crm_conversations, public.crm_messages
  TO service_role;
COMMIT;
