import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'permalink-'));
const {put,get,all,saveSecret}=await import('../server/store.mjs');
const {recoverPublicationPermalink,validPublicationPermalink}=await import('../server/publication-permalink.mjs');
const {realtimeRevision}=await import('../server/realtime-revision.mjs');
put('connections',{id:'ig',provider:'instagram',status:'connected'});saveSecret('ig',{token:'qa-only'});
let serial=0;const fixture=()=>put('publications',{id:'permalink-'+(++serial),connectionId:'ig',status:'published',externalId:'123456',url:'',attempts:1});
test('recover a missing Instagram link using only a media GET; never publish or alter the receipt',async()=>{
 const p=fixture(),before=all('publications').length;const result=await recoverPublicationPermalink(p.id,{request:async(url,options)=>{assert.match(url,/\/123456\?fields=permalink$/);assert.equal(options.method,undefined);assert.equal(options.headers.Authorization,'Bearer qa-only');assert.ok(options.signal);return {permalink:'https://www.instagram.com/reel/QA_abc/'};}});
 assert.equal(result.url,'https://www.instagram.com/reel/QA_abc/');assert.equal(result.externalId,p.externalId);assert.equal(result.attempts,1);assert.equal(result.status,'published');assert.equal(all('publications').length,before);
});
test('concurrent recovery shares one request and transient failures use retry backoff',async()=>{
 const p=fixture();let calls=0,release;const time=Date.now(),request=async()=>{calls++;await new Promise(r=>release=r);throw Error('temporary');};
 const a=recoverPublicationPermalink(p.id,{request,time}),b=recoverPublicationPermalink(p.id,{request,time});release();await Promise.all([a,b]);assert.equal(calls,1);assert.equal(get('publications',p.id).url,'');assert.equal(get('publications',p.id).status,'published');
 await recoverPublicationPermalink(p.id,{request,time:time+1000});assert.equal(calls,1);
 await recoverPublicationPermalink(p.id,{time:time+61000,request:async()=>{calls++;return {permalink:'https://instagram.com/p/now-ready/'};}});assert.equal(calls,2);assert.match(get('publications',p.id).url,/now-ready/);
});
test('removed/replaced receipts and unsafe provider URLs cannot be overwritten',async()=>{
 const p=fixture();await recoverPublicationPermalink(p.id,{request:async()=>{put('publications',{...get('publications',p.id),status:'deleted_remote'});return {permalink:'https://instagram.com/p/deleted/'};}});assert.equal(get('publications',p.id).url,'');
 for(const value of ['javascript:alert(1)','https://evil.test/p/a','https://instagram.com/','https://user:pass@instagram.com/p/a'])assert.equal(validPublicationPermalink(value,'instagram'),'');
 assert.equal(validPublicationPermalink('https://www.threads.com/@qa/post/abc','threads'),'https://www.threads.com/@qa/post/abc');
});
test('content realtime ignores typing/presence writes while publication and permissions changes invalidate it',()=>{
 const before=realtimeRevision('content');put('conversations',{id:'typing',typing:true});put('messages',{id:'new-chat',text:'QA'});assert.equal(realtimeRevision('content'),before);
 fixture();assert.notEqual(realtimeRevision('content'),before);const after=realtimeRevision('content');put('channel_teams',{channelId:'ig',teamId:'qa'});assert.notEqual(realtimeRevision('content'),after);
});
