import {all,db} from './store.mjs';
import {phonesIn} from './taophacdo.mjs';
import {groupLearner} from '../public/group-learner.js';
import {prepareLearnerLookups} from '../public/learner-lookups.js';
db.exec(`CREATE INDEX IF NOT EXISTS idx_learner_profile_messages ON records(json_extract(data,'$.conversationId'),json_extract(data,'$.createdAt'),id) WHERE kind='messages';`);
export function learnerMessageFacts(customer){
 const state=prepareLearnerLookups({customers:all('customers'),conversations:all('conversations')}),related=state.conversations.filter(c=>!c.deletedAt&&c.kind!=='comment'&&(c.customerId===customer.id||c.threadType===1&&(c.learnerCustomerId===customer.id||groupLearner(state,c)?.id===customer.id)));
 const history=db.prepare(`SELECT 1 FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.deletedAt') IS NULL AND json_extract(data,'$.direction') IN ('incoming','outgoing') AND COALESCE(json_extract(data,'$.status'),'') NOT IN ('failed','unknown','sending','pending') AND (?='' OR json_extract(data,'$.createdAt')>?) LIMIT 1`);
 const texts=db.prepare(`SELECT json_extract(data,'$.text') AS text,json_extract(data,'$.createdAt') AS createdAt FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='incoming' AND json_extract(data,'$.deletedAt') IS NULL ORDER BY json_extract(data,'$.createdAt'),id`);
 let phone='',firstAt='',hasHistory=false;
 for(const c of related){if(!hasHistory&&history.get(c.id,c.clearedBefore||'',c.clearedBefore||''))hasHistory=true;if(c.threadType===1)continue;for(const row of texts.iterate(c.id)){const numbers=phonesIn(row.text);if(numbers.length!==1)continue;if(!phone||String(row.createdAt)<firstAt){phone=numbers[0];firstAt=String(row.createdAt);}break;}}
 return {phone,hasHistory};
}
