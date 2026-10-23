import test from 'node:test';
import assert from 'node:assert/strict';
import {beginChatDraftSend} from '../public/chat-send-draft.js';
const empty=()=>({text:'',assetIds:[],quoteId:'',note:false});
test('composer clears immediately while submitted text and photos stay intact',()=>{
 const draft={...empty(),text:'Xin chào',assetIds:['photo'],quoteId:'original'};
 const send=beginChatDraftSend(draft,empty());
 assert.deepEqual(send.cleared,empty());
 draft.assetIds.push('another');
 assert.deepEqual(send.submitted.assetIds,['photo']);
 assert.deepEqual(send.restore(send.cleared),{...empty(),text:'Xin chào',assetIds:['photo'],quoteId:'original'});
});
test('send failure does not overwrite the next message being composed',()=>{
 const send=beginChatDraftSend({...empty(),text:'First message'},empty());
 const next={...empty(),text:'Second message',assetIds:['new-photo']};
 assert.deepEqual(send.restore(next),next);
});
