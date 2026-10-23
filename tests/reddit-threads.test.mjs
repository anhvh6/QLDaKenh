import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'reddit-threads-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,saveSecret}=await import('../server/store.mjs');
const {redditReply,redditVote,syncRedditComments}=await import('../server/reddit-interactions.mjs');
const {publicationMetrics,threadsRepost}=await import('../server/social-metrics.mjs');
const {threadsTopic}=await import('../public/platform-text-rules.js');
const {publish,continuePublish}=await import('../server/connectors.mjs');
const {syncComments}=await import('../server/comments.mjs');
const c={id:'reddit',provider:'reddit',expectedAccount:'owner',accountId:'self',mode:'api',status:'connected'};saveSecret(c.id,{token:'test'});

test('Reddit replies reject API logical errors and uncertain acknowledgements',async()=>{
 await assert.rejects(redditReply(c,'bad','Hello',()=>assert.fail()),/ID/);
 await assert.rejects(redditReply(c,'t1_abc','Hello',async()=>({json:{errors:[['RATELIMIT','Wait']]}})),/Wait/);
 await assert.rejects(redditReply(c,'t1_abc','Hello',async()=>({json:{data:{}}})),e=>e.unknown===true);
 const r=await redditReply(c,'t1_abc','Reply #yoga @user',async(url,o)=>{assert.equal(o.body.get('thing_id'),'t1_abc');assert.equal(o.body.get('text'),'Reply #yoga @user');return {json:{data:{things:[{kind:'t1',data:{name:'t1_new'}}]}}};});assert.equal(r.id,'t1_new');
});
test('Reddit votes require readback and never label score as Like count',async()=>{
 let n=0;const r=await redditVote(c,'t1_abc',true,async(url,o)=>{if(n++===0){assert.equal(o.body.get('dir'),'1');return {};}return {data:{children:[{data:{name:'t1_abc',likes:true,score:6}}]}};});assert.equal(r.score,6);assert.equal(r.likeCount,undefined);
 await assert.rejects(redditVote(c,'t1_abc',false,async()=>({data:{children:[]}})),e=>e.unknown===true);
});
const post={kind:'t3',data:{id:'post',name:'t3_post',title:'Title',created_utc:1792700000,permalink:'/r/test/comments/post/title/'}};
const comment=(id,author,body,replies='')=>({kind:'t1',data:{name:id,body,author,author_fullname:'t2_'+author,created_utc:1792700001,parent_id:'t3_post',score:8,likes:true,permalink:'/r/test/comments/post/title/'+id,replies}});
function request(url){if(url.endsWith('/me'))return {id:'self',name:'owner'};if(url.includes('/submitted?'))return {data:{children:[post]}};return [{},{data:{children:[comment('t1_peer','peer','Hello',{data:{children:[{...comment('t1_self','owner','Reply'),data:{...comment('t1_self','owner','Reply').data,parent_id:'t1_peer'}}]}}),comment('t1_deleted','[deleted]','[deleted]')]}}];}
test('Reddit intake preserves reply identity, scores, deduplication and deletion redaction',async()=>{
 put('connections',c);const sync=await syncComments(c,async url=>request(url));assert.equal(sync.status,'ready');
 const msgs=all('messages');assert.equal(msgs.length,2);assert.equal(msgs.find(m=>m.externalId==='t1_self').direction,'outgoing');assert.equal(msgs[0].score,8);assert.equal(msgs[0].likeCount,null);
 await syncComments(c,async url=>request(url));assert.equal(all('messages').length,2);
 const rows=[];await syncRedditComments(c,{},async url=>request(url),(...a)=>rows.push(a));assert.equal(rows[1][1].is_reply_owned_by_me,true);assert.equal(rows[2][1].remote_deleted,true);
 await syncComments(c,async url=>url.includes('/comments/')?[{},{data:{children:[comment('t1_peer','[deleted]','[deleted]')]}}]:request(url));assert.equal(get('messages',msgs.find(m=>m.externalId==='t1_peer').id).text,'');assert.ok(get('messages',msgs.find(m=>m.externalId==='t1_peer').id).deletedAt);
});
test('Threads chooses one Unicode topic without changing mentions or original caption',()=>{
 assert.deepEqual(threadsTopic('Chào @khach #đẹp #yoga'),{topic_tag:'đẹp'});assert.deepEqual(threadsTopic('https://x/#part @user'),{});assert.deepEqual(threadsTopic('#'+'a'.repeat(51)+' #yoga'),{topic_tag:'yoga'});
});
test('Threads native topic is sent for single posts and carousel parent only',async()=>{
 const original=global.fetch,channel={id:'threads',provider:'threads',accountId:'123'};saveSecret(channel.id,{token:'test'});
 try{global.fetch=async(url,o)=>{if(o?.method==='POST'){const b=JSON.parse(o.body);assert.equal(b.topic_tag,'đẹp');assert.equal(b.text,'#đẹp @khach #yoga');return Response.json({id:'77'});}return Response.json({status:'FINISHED'});};
 await publish(channel,{type:'text',caption:'#đẹp @khach #yoga'});
 await continuePublish(channel,{carouselPending:true,childContainerIds:['44'],caption:'#đẹp @khach #yoga'});
 }finally{global.fetch=original;}
});
test('Threads insights and repost validate results; Reddit metrics omit unavailable data',async()=>{
 saveSecret('threads',{token:'test'});assert.deepEqual(await publicationMetrics({id:'threads',provider:'threads'},{externalId:'77'},async()=>({data:[{name:'likes',values:[{value:0}]},{name:'shares',values:[{value:2}]}]})),{likes:0,shares:2});
 await assert.rejects(publicationMetrics({id:'threads',provider:'threads'},{externalId:'77'},async()=>({data:[]})),/chưa trả/);
 assert.equal((await threadsRepost({id:'threads'},'77',async()=>({id:'88'}))).uri,'88');await assert.rejects(threadsRepost({id:'threads'},'77',async()=>({success:true})),e=>e.unknown);
 const metrics=await publicationMetrics(c,{externalId:'t3_post'},async()=>({data:{children:[{data:{name:'t3_post',score:5,num_comments:2}}]}}));assert.deepEqual(metrics,{score:5,replies:2});
});
