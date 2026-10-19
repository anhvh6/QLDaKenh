import test from 'node:test';import assert from 'node:assert/strict';
import {chatComposerBusy} from '../public/chat-composer-state.js';
test('background refresh protects focused input, Vietnamese composition and in-flight send',()=>{
 const doc=(focused=false,busy=false)=>({activeElement:{closest:selector=>focused&&selector==='#reply-form'?{}:null},querySelector:()=>busy?{}:null});
 assert.equal(chatComposerBusy(doc(true,false)),true);
 assert.equal(chatComposerBusy(doc(false,true)),true);
 assert.equal(chatComposerBusy(doc(false,false)),false);
 assert.equal(chatComposerBusy({activeElement:null,querySelector:()=>null}),false);
});
