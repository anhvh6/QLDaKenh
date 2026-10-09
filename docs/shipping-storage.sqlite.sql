CREATE TABLE IF NOT EXISTS shipping_requests (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, account_id TEXT NOT NULL,
 reference TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL,
 response TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(account_id, reference)
);
CREATE INDEX IF NOT EXISTS shipping_requests_order ON shipping_requests(order_id);
CREATE TABLE IF NOT EXISTS shipping_events (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tracking TEXT NOT NULL,
 reference TEXT, status_code INTEGER, occurred_at TEXT NOT NULL,
 received_at TEXT NOT NULL, payload TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shipping_events_tracking ON shipping_events(account_id,tracking,occurred_at);
CREATE INDEX IF NOT EXISTS shipping_order_account
 ON records(json_extract(data,'$.shippingAccountId'),json_extract(data,'$.shippingState')) WHERE kind='orders';
CREATE UNIQUE INDEX IF NOT EXISTS shipping_account_tracking
 ON records(json_extract(data,'$.accountId'),json_extract(data,'$.tracking'))
 WHERE kind='shipments' AND json_extract(data,'$.carrier')='viettelpost' AND json_extract(data,'$.tracking') IS NOT NULL AND json_extract(data,'$.tracking')<>'';
CREATE VIEW IF NOT EXISTS shipping_order_details AS
 SELECT id,version,json_extract(data,'$.code') AS order_code,
 json_extract(data,'$.receiverName') AS receiver_name,json_extract(data,'$.phone') AS receiver_phone,
 json_extract(data,'$.address') AS receiver_address,json_extract(data,'$.shippingAccountId') AS account_id,
 json_extract(data,'$.shippingState') AS shipping_state,json_extract(data,'$.parcel') AS parcel,
 json_extract(data,'$.total') AS total,json_extract(data,'$.paid') AS paid,
 json_extract(data,'$.items') AS items,updated_at FROM records WHERE kind='orders';
CREATE VIEW IF NOT EXISTS shipping_account_details AS
 SELECT id,version,json_extract(data,'$.name') AS name,
 json_extract(data,'$.provider') AS provider,json_extract(data,'$.environment') AS environment,
 json_extract(data,'$.sender') AS sender,json_extract(data,'$.inventories') AS inventories,
 json_extract(data,'$.active') AS active,updated_at FROM records WHERE kind='shipping_accounts';
INSERT OR IGNORE INTO migrations VALUES(3,datetime('now'));
CREATE UNIQUE INDEX IF NOT EXISTS carrier_history_account_tracking
 ON records(json_extract(data,'$.accountId'),json_extract(data,'$.tracking')) WHERE kind='carrier_orders';
INSERT OR IGNORE INTO migrations VALUES(4,datetime('now'));
