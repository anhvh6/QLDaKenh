import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'media-snapshot-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,all,dataDir}=await import('../server/store.mjs');
const {mediaSnapshot,mediaRevision}=await import('../server/media-snapshot.mjs');
const {mediaThumbnail}=await import('../server/media-thumbnail.mjs');
const owner={id:'owner',role:'owner'};
test('media snapshot excludes unrelated workspace records and retains media operations metadata',()=>{
 put('assets',{id:'global',name:'Photo',type:'image',url:'/uploads/asset_global.jpg',description:'Editable',scopes:['chat','post'],active:true,internalLargeData:'secret'.repeat(10000)});
 put('assets',{id:'allowed',type:'video',url:'/uploads/asset_allowed.mp4',connectionId:'channel-a'});put('assets',{id:'hidden',type:'image',url:'/uploads/asset_global.jpg',connectionId:'channel-b'});
 put('media_categories',{id:'folder',name:'Folder',active:true});put('settings',{id:'media-favorites-owner',ids:['global']});
 put('messages',{id:'sent',direction:'outgoing',status:'sent',attachments:[{assetId:'global'}]});
 for(let i=0;i<250;i++){put('contents',{id:'large-'+i,caption:'unrelated'.repeat(1000)});put('customers',{id:'customer-'+i,name:'Customer',medicalDetails:'must not load'.repeat(500)});}
 const start=performance.now(),state=mediaSnapshot(owner,{revision:mediaRevision(),providers:{}}),ms=performance.now()-start;
 assert.equal(state.snapshotView,'media');assert.equal(state.mediaCompact,true);assert.equal(state.assets[0].internalLargeData,undefined);assert.ok(state.assets.find(a=>a.id==='global').usage.count>0);assert.equal(state.assets.find(a=>a.id==='global').description,'Editable');
 for(const key of ['contents','customers','messages','publications','orders','savedPlanSummaries'])assert.deepEqual(state[key],[]);
 const compact=Buffer.byteLength(JSON.stringify(state)),unrelated=Buffer.byteLength(JSON.stringify({contents:all('contents'),customers:all('customers')}));assert.ok(compact<unrelated/20);console.log(JSON.stringify({compactBytes:compact,unrelatedBytes:unrelated,buildMs:Number(ms.toFixed(1))}));
});
test('channel-scoped assets and usage cannot leak into another employee library',()=>{
 put('team_members',{teamId:'team',userId:'staff'});put('channel_teams',{teamId:'team',connectionId:'channel-a'});
 const state=mediaSnapshot({id:'staff',role:'support'},{revision:mediaRevision(),providers:{}});assert.deepEqual(new Set(state.assets.map(a=>a.id)),new Set(['global','allowed']));
});
test('unrelated edits do not invalidate media revision; favorites and assets do',()=>{
 const before=mediaRevision();put('contents',{title:'No media change'});put('customers',{name:'Unrelated'});assert.equal(mediaRevision(),before);put('settings',{id:'media-favorites-owner',ids:[]});assert.notEqual(mediaRevision(),before);
});
test('small images are served directly and invalid or unauthorized thumbnails stay inaccessible',async()=>{
 mkdirSync(join(dataDir,'uploads'),{recursive:true});writeFileSync(join(dataDir,'uploads','asset_global.jpg'),'small-image');assert.equal((await mediaThumbnail(owner,'global')).path,join(dataDir,'uploads','asset_global.jpg'));
 await assert.rejects(mediaThumbnail({id:'other',role:'viewer'},'hidden'),e=>e.status===403);await assert.rejects(mediaThumbnail(owner,'missing'));
});
