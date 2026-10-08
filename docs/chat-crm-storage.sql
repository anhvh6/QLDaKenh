-- SQLite on the VPS (data/hub.sqlite), not Supabase/PostgreSQL.
-- Existing records table already stores customers, conversations and messages.
-- CRM profiles are optional records of kind crm_profiles, keyed by customer ID.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
 ON records(json_extract(data,'$.conversationId'),json_extract(data,'$.createdAt')) WHERE kind='messages';
CREATE INDEX IF NOT EXISTS idx_records_customer
 ON records(kind,json_extract(data,'$.customerId'));
CREATE VIEW IF NOT EXISTS crm_customers AS
 SELECT id AS customer_id,json_extract(data,'$.name') AS name,version,updated_at
 FROM records WHERE kind='customers';
CREATE VIEW IF NOT EXISTS crm_conversations AS
 SELECT id AS conversation_id,json_extract(data,'$.customerId') AS customer_id,
 json_extract(data,'$.connectionId') AS channel_id,json_extract(data,'$.deletedAt') AS deleted_at
 FROM records WHERE kind='conversations';
CREATE VIEW IF NOT EXISTS crm_messages AS
 SELECT id AS message_id,json_extract(data,'$.conversationId') AS conversation_id,
 json_extract(data,'$.direction') AS direction,json_extract(data,'$.text') AS text,
 json_extract(data,'$.status') AS status,json_extract(data,'$.createdAt') AS created_at,
 json_extract(data,'$.deletedAt') AS deleted_at FROM records WHERE kind='messages';
