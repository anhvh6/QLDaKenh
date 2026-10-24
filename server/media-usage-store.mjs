import {db,all,kindsRevision} from './store.mjs';
import {mediaUsage} from './media-usage.mjs';
let cache;
// Parse attachment metadata only, never entire message bodies or video payloads.
export function storedMediaUsage(){
 const revision=kindsRevision(['messages','publications','assets']);
 if(cache&&cache.revision===revision)return cache.value;
 const messages=db.prepare("SELECT id,json_extract(data,'$.attachments') attachments,json_extract(data,'$.createdAt') createdAt,json_extract(data,'$.status') status FROM records WHERE kind='messages' AND json_extract(data,'$.direction')='outgoing' AND json_extract(data,'$.status') IN ('accepted','sent','delivered','read') AND json_array_length(data,'$.attachments')>0").all().map(r=>({...r,direction:'outgoing',attachments:JSON.parse(r.attachments)}));
 const publications=db.prepare("SELECT id,json_extract(data,'$.assets') assets,json_extract(data,'$.createdAt') createdAt,json_extract(data,'$.publishedAt') publishedAt,json_extract(data,'$.status') status FROM records WHERE kind='publications' AND json_extract(data,'$.status') IN ('published','manually_confirmed') AND json_array_length(data,'$.assets')>0").all().map(r=>({...r,assets:JSON.parse(r.assets)}));
 const value=mediaUsage(all('assets'),messages,publications);cache={at:Date.now(),revision,value};return value;
}
