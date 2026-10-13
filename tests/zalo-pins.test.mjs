import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeZaloPins} from '../server/zalo-pins.mjs';import {pinnedRows} from '../public/chat-pins.js';
test('personal/group platform pins normalize and match actual message content, excluding notes',()=>{
 const topic={id:'topic',params:JSON.stringify({global_msg_id:'external',client_msg_id:'client',title:'Preview',senderName:'Customer'})};
 const a=normalizeZaloPins({data:[JSON.stringify(topic)]}),b=normalizeZaloPins({items:[{boardType:2,data:topic},{boardType:1,data:{id:'note',params:{title:'Note'}}}]});assert.deepEqual(a,b);
 const state={messages:[{id:'message',conversationId:'chat',externalId:'external',text:'Full message',pinned:true},{id:'local',conversationId:'chat',text:'Local',pinned:true}]};
 const rows=pinnedRows(state,{id:'chat',platformPins:a});assert.equal(rows.length,2);assert.equal(rows[0].text,'Full message');assert.equal(rows[0].remote,true);assert.equal(rows[1].remote,false);
 assert.throws(()=>normalizeZaloPins({data:{invalid:true}}));
});
