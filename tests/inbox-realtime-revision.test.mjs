import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'inbox-events-'));
const {put}=await import('../server/store.mjs');
const {realtimeRevision}=await import('../server/realtime-revision.mjs');
test('Inbox ignores worker checkpoints but still signals messages and permission changes',()=>{
 const before=realtimeRevision('inbox');
 for(const kind of ['facebook_chat_sync','facebook_chat_cursors','facebook_webhook_status','meta_webhook_receipts','contents'])put(kind,{id:'noise',status:'ready'});
 assert.equal(realtimeRevision('inbox'),before);
 put('messages',{id:'incoming',conversationId:'chat',text:'QA'});
 const message=realtimeRevision('inbox');assert.notEqual(message,before);
 put('channel_teams',{id:'scope',teamId:'team',connectionId:'channel'});
 assert.notEqual(realtimeRevision('inbox'),message);
});
