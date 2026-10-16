import {db,transaction} from './store.mjs';
db.exec(`CREATE TABLE IF NOT EXISTS pos_change_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,record_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pos_sync_context(id INTEGER PRIMARY KEY CHECK(id=1),inbound INTEGER NOT NULL);
INSERT OR IGNORE INTO pos_sync_context VALUES(1,0);`);
export const phoneExpression="CASE WHEN length(replace(replace(replace(replace(replace(replace(coalesce(json_extract(data,'$.phone'),''),'+',''),' ',''),'.',''),'-',''),'(',''),')',''))=11 AND substr(replace(replace(replace(replace(replace(replace(coalesce(json_extract(data,'$.phone'),''),'+',''),' ',''),'.',''),'-',''),'(',''),')',''),1,2)='84' THEN '0'||substr(replace(replace(replace(replace(replace(replace(coalesce(json_extract(data,'$.phone'),''),'+',''),' ',''),'.',''),'-',''),'(',''),')',''),3) ELSE replace(replace(replace(replace(replace(replace(coalesce(json_extract(data,'$.phone'),''),'+',''),' ',''),'.',''),'-',''),'(',''),')','') END";
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS pos_link_identity ON records(json_extract(data,'$.accountId'),json_extract(data,'$.kind'),json_extract(data,'$.remoteId')) WHERE kind='pos_links';
CREATE INDEX IF NOT EXISTS pos_customer_phone ON records(${phoneExpression}) WHERE kind='customers';
CREATE INDEX IF NOT EXISTS pos_product_sku ON records(json_extract(data,'$.sku') COLLATE NOCASE) WHERE kind='products';`);
for(const operation of ['INSERT','UPDATE'])db.exec(`CREATE TRIGGER IF NOT EXISTS pos_capture_${operation.toLowerCase()} AFTER ${operation} ON records
WHEN NEW.kind IN ('products','customers','orders','shipments','stock') AND (SELECT inbound FROM pos_sync_context WHERE id=1)=0
AND EXISTS(SELECT 1 FROM records WHERE kind='pos_accounts' AND json_extract(data,'$.active')=1)
BEGIN INSERT INTO pos_change_log(kind,record_id) VALUES(NEW.kind,NEW.id); END;`);
export function inbound(fn){return transaction(()=>{db.prepare('UPDATE pos_sync_context SET inbound=1 WHERE id=1').run();try{return fn();}finally{db.prepare('UPDATE pos_sync_context SET inbound=0 WHERE id=1').run();}});}
export const changeSequence=()=>db.prepare('SELECT coalesce(max(seq),0) AS seq FROM pos_change_log').get().seq;
