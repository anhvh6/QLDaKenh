import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const db=new DatabaseSync(resolve(process.env.DATA_DIR||'data','hub.sqlite'),{readOnly:true});
try{console.log(JSON.stringify({shippingMigration:!!db.prepare('SELECT version FROM migrations WHERE version=3').get(),accounts:db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='shipping_accounts'").get().n,requests:db.prepare('SELECT COUNT(*) AS n FROM shipping_requests').get().n,events:db.prepare('SELECT COUNT(*) AS n FROM shipping_events').get().n}));}finally{db.close();}
