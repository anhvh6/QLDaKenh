import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
// These fixtures exercise active chats without calling any external provider.
export function connectDemoFixtures(directory){
 const db=new DatabaseSync(join(directory,'hub.sqlite'));
 try{db.prepare("UPDATE records SET data=json_set(data,'$.status','connected'),version=version+1 WHERE kind='connections' AND json_extract(data,'$.mode')='demo'").run();}finally{db.close();}
}
export function fixtureRecords(directory,kind){
 const db=new DatabaseSync(join(directory,'hub.sqlite'),{readOnly:true});
 try{return db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.data));}finally{db.close();}
}
