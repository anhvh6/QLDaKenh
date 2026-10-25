import test from 'node:test';import assert from 'node:assert/strict';
import {mediaUsage} from '../server/media-usage.mjs';
test('chat/comment sends count once per asset; posting never changes chat rank',()=>{
 const assets=[{id:'both',url:'/a.jpg'},{id:'post',url:'/b.mp4'}],messages=[{direction:'outgoing',status:'read',createdAt:'2026-10-24',attachments:[{assetId:'both'},{url:'/a.jpg'}]},{direction:'outgoing',status:'sent',createdAt:'2026-10-25',conversationId:'comment',attachments:[{assetId:'both'}]},{direction:'outgoing',status:'failed',attachments:[{assetId:'post'}]}];
 const usage=mediaUsage(assets,messages,[{status:'published',assets:['both','post'],publishedAt:'2026-10-26'}]);
 assert.deepEqual(usage.get('both'),{count:3,lastAt:'2026-10-26',chatCount:2,chatLastAt:'2026-10-25'});assert.equal(usage.get('post').chatCount,0);
});
