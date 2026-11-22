import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'copy-publication-index-'));
const {put,db}=await import('../server/store.mjs');
const {publicationCandidates}=await import('../server/copy-publication-lookup.mjs');
test('candidate lookup uses indexes for item/content, dedupes and avoids unrelated history',()=>{
 put('publications',{id:'both',copyPlanItemId:'item',contentId:'content'});put('publications',{id:'same-content',contentId:'content'});put('publications',{id:'same-item',copyPlanItemId:'item'});
 put('publications',{id:'other',contentId:'unrelated',caption:'unrelated-history-marker'});
 const parse=JSON.parse;JSON.parse=(value,...rest)=>{assert.ok(!String(value).includes('unrelated-history-marker'));return parse(value,...rest);};
 try{assert.deepEqual(publicationCandidates({id:'item',contentId:'content'}).map(p=>p.id).sort(),['both','same-content','same-item']);assert.deepEqual(publicationCandidates({id:'none'}),[]);}finally{JSON.parse=parse;}
 for(const field of ['copyPlanItemId','contentId']){const plan=db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind='publications' AND json_extract(data,'$.${field}')=?`).all('test');assert.ok(plan.some(p=>/USING INDEX idx_publication_/.test(p.detail)),JSON.stringify(plan));}
});

test('the real UNION statement is planned on the item and content indexes, never a per-kind scan',async()=>{
 const {publicationCandidatesSql}=await import('../server/copy-publication-lookup.mjs');
 const plan=db.prepare('EXPLAIN QUERY PLAN '+publicationCandidatesSql).all('item','content').map(r=>r.detail).join('\n');
 assert.ok(!/sqlite_autoindex/.test(plan),plan);
 assert.ok(/idx_publication_copy_item/.test(plan)&&/idx_publication_content/.test(plan),plan);
 for(let i=0;i<1200;i++)put('publications',{id:'bulk'+i,copyPlanItemId:'bulk-item'+(i%400),contentId:'bulk-content'+i});
 const statement=db.prepare(publicationCandidatesSql),start=performance.now();
 for(let i=0;i<500;i++)statement.all('bulk-item'+(i%400),i%2?'bulk-content'+i:null);
 assert.ok((performance.now()-start)/500<0.5,'each lookup should take well under 0.5 ms with 1,200 publications');
});
