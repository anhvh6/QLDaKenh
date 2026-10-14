import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
mkdirSync('test-data', { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(resolve('test-data'), 'preflight-'));
process.env.PLAN_REMOTE_CATALOG = '0';
const { put, all, get } = await import('../server/store.mjs');
const { publicationPreflight } = await import('../server/publish-preflight.mjs');
const { schedule } = await import('../server/domain.mjs');
const { scheduleCopied } = await import('../server/social-copy.mjs');
const owner = { id: 'qa', role: 'owner' };
for (const provider of ['threads','instagram','youtube','tiktok','facebook']) put('connections', { id: provider, name: provider, provider, mode: 'api', status: 'connected' });
const content = (extra = {}) => ({ id: 'qa-content', title: 'QA', caption: 'Nội dung 💚', type: 'text', channels: ['threads'], assets: [], ...extra });

test('aggregates every destination error and respects channel-specific caption without mutating records', () => {
 const before = all('publications').length;
 const c = content({ caption: 'a'.repeat(2201), channels: ['threads','instagram'], variants: { threads: { caption: 'Ngắn' } } });
 const result = publicationPreflight(owner, c, { immediate: true });
 assert.equal(result.ok, false);assert.ok(result.issues.every(i => i.channelId === 'instagram'));
 assert.ok(result.issues.some(i => i.message.includes('2201/2200')));
 assert.ok(result.issues.some(i => i.message.includes('định dạng text')));
 assert.equal(all('publications').length, before);
 assert.equal(publicationPreflight(owner, content({caption:'💚'.repeat(500)}), {immediate:true}).ok, true);
});

test('checks YouTube UTF-8 bytes and TikTok UTF-16 rather than silently cutting captions', () => {
 const video = put('assets', { type: 'video', active: true });
 const result = publicationPreflight(owner, content({type:'video',assets:[video.id],channels:['youtube','tiktok'],title:'t'.repeat(101),caption:'💚'.repeat(1300)}), {immediate:true});
 assert.ok(result.issues.some(i => i.channelId === 'youtube' && i.message.includes('101/100')));
 assert.ok(result.issues.some(i => i.channelId === 'youtube' && i.message.includes('5200/5000')));
 assert.ok(result.issues.some(i => i.channelId === 'tiktok' && i.message.includes('2600/2200')));
});

test('source Reup is rejected before Drive download and scheduling also checks server-side', async () => {
 const source = put('copy_posts',{userId:owner.id,media:[{type:'video',url:'https://example.com/v.mp4'}]});
 const c = put('contents',content({caption:'a'.repeat(501),type:'video',sourceCopyId:source.id}));
 const beforeJobs = all('copy_jobs').length, beforePubs = all('publications').length;
 await assert.rejects(scheduleCopied(owner,c.id,{version:c.version,immediate:true}), /501\/500/);
 assert.equal(all('copy_jobs').length,beforeJobs);assert.equal(all('publications').length,beforePubs);
 assert.throws(()=>schedule(owner,c.id,{version:c.version,immediate:true}), /501\/500/);
 assert.equal(get('contents',c.id).status,undefined);
 assert.equal(publicationPreflight(owner,c,{scheduleAt:new Date(Date.now()+1000).toISOString()}).issues.some(i=>i.message.includes('10 phút')),true);
});

test('source media is checked before import; valid future source can proceed to download', () => {
 const source = put('copy_posts',{userId:owner.id,media:[{type:'image'},{type:'video'}]});
 const c=content({type:'video',channels:['facebook'],sourceCopyId:source.id});
 assert.ok(publicationPreflight(owner,c,{immediate:true}).issues.some(i=>i.message.includes('album ảnh')));
 assert.equal(publicationPreflight(owner,{...c,channels:['threads']},{scheduleAt:new Date(Date.now()+3600000).toISOString()}).ok,true);
});
