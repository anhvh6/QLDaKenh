import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
const hooks=registerHooks({resolve(specifier,context,nextResolve){if(specifier==='sync-fetch')return {url:'data:text/javascript,export default ()=>({status:200,json:()=>({access_token:"test-only",expires_in:3600})})',shortCircuit:true};return nextResolve(specifier,context);}});
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'plan-sources-'));
process.env.PLAN_REMOTE_CATALOG='1';
const {put}=await import('../server/store.mjs');
const {listPlanSources,getPlanSource}=await import('../server/plan-sources.mjs');
test('remote plans appear without importing customers; source details exclude identity secrets and enforce access',async()=>{
 const fetchBefore=globalThis.fetch;const owner={id:'owner',role:'owner'},staff={id:'staff',role:'support'};
 put('customers',{id:'target',name:'Target',createdBy:'staff'});
 globalThis.fetch=async url=>{const u=new URL(url),table=u.pathname.split('/').pop(),selection=u.searchParams.get('select');let data=[];
  if(table==='customers')data=selection.startsWith('note,')?[{note:'Source note',chewing_status:'Source chewing',sidebar_blocks_json:[]}]:[{customer_id:'REMOTE-1',customer_name:'Remote student',sdt:'',is_customized:true,token:'never-return',link:'https://example.test/private'}];
  if(table==='customer_tasks')data=[{id:'task',day:1,title:'Source exercise'},{id:'deleted',day:2,is_deleted:true}];
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{const list=await listPlanSources(owner,'target');assert.ok(list.some(s=>s.id==='remote:REMOTE-1'));const source=await getPlanSource(owner,'target','remote:REMOTE-1');assert.equal(source.customer.note,'Source note');assert.equal(source.tasks.length,1);assert.equal(source.tasks[0].title,'Source exercise');assert.equal(source.customer.token,undefined);assert.equal(source.customer.link,undefined);assert.deepEqual(await listPlanSources(staff,'target'),[]);await assert.rejects(getPlanSource(staff,'target','remote:REMOTE-1'),/quyền/);
 globalThis.fetch=async()=>new Response('{}',{status:503});await assert.rejects(listPlanSources(owner,'target'),/Supabase/);
 }finally{globalThis.fetch=fetchBefore;}
});
