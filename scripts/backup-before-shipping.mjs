import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
const dir=resolve(process.env.DATA_DIR||'data'),source=join(dir,'hub.sqlite');
if(existsSync(source)){mkdirSync(join(dir,'backups'),{recursive:true});const target=join(dir,'backups','pre-viettelpost-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'),db=new DatabaseSync(source,{readOnly:true});try{await backup(db,target);chmodSync(target,0o600);console.log('Database backup: '+basename(target));}finally{db.close();}}else console.log('No existing database to back up');
