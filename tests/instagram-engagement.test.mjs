import test from 'node:test';
import assert from 'node:assert/strict';
import {instagramCommentLike} from '../server/instagram-engagement.mjs';
test('Instagram likes use IG account endpoint, comment ID and User authorization',async()=>{
 for(const like of [true,false])await instagramCommentLike({accountId:'ig-123'},'comment-456',like,{userToken:'user-token',token:'page-token'},async(url,options)=>{
  assert.equal(new URL(url).pathname,'/v26.0/ig-123/likes');assert.equal(new URL(url).searchParams.get('comment_id'),'comment-456');assert.equal(options.method,like?'POST':'DELETE');assert.equal(options.headers.Authorization,'Bearer user-token');return {success:true};
 });
});
test('missing User token refuses dispatch and ambiguous response is not treated as success',async()=>{
 await assert.rejects(instagramCommentLike({accountId:'ig'},'comment',true,{token:'page'},()=>{throw Error('must not send');}),/kết nối lại/);
 await assert.rejects(instagramCommentLike({accountId:'ig'},'comment',true,{userToken:'user'},async()=>({})),e=>e.unknown===true);
});
