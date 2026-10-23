import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {mediaCover,mediaPreview,setMediaThumbnailSupport} from '../public/media-cover.js';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'content-snapshot-'));
const {put}=await import('../server/store.mjs');
const {contentSnapshot}=await import('../server/content-snapshot.mjs');
const {mediaThumbnail}=await import('../server/media-thumbnail.mjs');
test('video covers contain only a lazy image, never the MP4 source',()=>{
 setMediaThumbnailSupport(true);const a={id:'video_1',type:'video',url:'/uploads/private.mp4',name:'Video <test>'},html=mediaCover(a);
 assert.ok(html.includes('loading="lazy"'));assert.ok(html.includes('/api/media/thumbnail/video_1'));assert.ok(!html.includes('.mp4'));assert.ok(!html.includes('<video'));assert.ok(html.includes('&lt;test&gt;'));
 const preview=mediaPreview(a);assert.ok(preview.includes('data-content-video='));assert.ok(!preview.includes('<video'));
});
test('content snapshot preserves publishing fields and scopes private channels',()=>{
 const a=put('connections',{id:'allowed',provider:'facebook',accountId:'private-account',status:'connected'}),b=put('connections',{id:'denied',provider:'instagram',status:'connected'});
 put('team_members',{userId:'editor',teamId:'team'});put('channel_teams',{teamId:'team',connectionId:a.id});
 put('contents',{id:'permitted',title:'Full title',caption:'Complete editable caption',channels:[a.id],variants:{allowed:{caption:'Edited'}}});put('contents',{id:'private',channels:[b.id]});
 put('assets',{id:'private-video',connectionId:b.id,type:'video',url:'/uploads/private.mp4'});
 put('publications',{id:'denied-pub',connectionId:b.id});put('customers',{id:'unrelated',name:'Private customer'});
 put('copy_plans',{id:'own-plan',userId:'editor'});put('copy_plans',{id:'other-plan',userId:'other'});
 const s=contentSnapshot({id:'editor',role:'editor'},{revision:'revision',providers:{}});
 assert.deepEqual(s.contents.map(c=>c.id),['permitted']);assert.equal(s.contents[0].caption,'Complete editable caption');assert.equal(s.contents[0].variants.allowed.caption,'Edited');assert.equal(s.connections[0].accountId,undefined);assert.equal(s.assets.length,0);assert.equal(s.customers.length,0);assert.equal(s.publications.length,0);assert.deepEqual(s.copyCatalog.plans.map(p=>p.id),['own-plan']);
});
test('thumbnail endpoint checks channel permission before touching the file',async()=>{
 await assert.rejects(()=>mediaThumbnail({id:'editor',role:'editor'},'private-video'),error=>error.status===403);
});
