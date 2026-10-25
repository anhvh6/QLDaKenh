import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'meta-diagnostics-'));
const {put,saveSecret,stateRevision}=await import('../server/store.mjs');
test('authenticated diagnostic reports shapes without printing credentials or customer data or changing records',()=>{
 put('connections',{id:'diagnostic-channel',provider:'instagram',accountId:'private-business-id',mode:'api',status:'connected'});saveSecret('diagnostic-channel',{token:'NEVER_PRINT_TOKEN',pageId:'private-page-id'});
 const preload=join(process.env.DATA_DIR,'mock-fetch.mjs');writeFileSync(preload,`global.fetch=async url=>{let data;const path=new URL(url).pathname;if(path.endsWith('/subscribed_apps'))data={data:[{subscribed_fields:['messages']}]};else if(path.endsWith('/conversations'))data={data:[{id:'private-thread-id'}]};else if(path.endsWith('/messages'))data={data:[{id:'private-message-id',created_time:'2026-10-25T08:00:00Z'}]};else if(path.endsWith('/private-message-id'))data={id:'private-message-id',from:{id:'PRIVATE_CUSTOMER_ID'},created_time:'2026-10-25T08:00:00Z',message:'CUSTOMER_PRIVATE_TEXT'};else data={id:'private-business-id',username:'public_business'};return Response.json(data);};`);
 const before=stateRevision(),output=execFileSync(process.execPath,['--import',pathToFileURL(preload).href,'scripts/diagnose-meta-chat.mjs'],{encoding:'utf8',env:process.env,stdio:['ignore','pipe','pipe']});
 for(const value of ['NEVER_PRINT_TOKEN','PRIVATE_CUSTOMER_ID','CUSTOMER_PRIVATE_TEXT','private-business-id','private-page-id','private-message-id','private-thread-id'])assert.equal(output.includes(value),false,value);
 const rows=output.trim().split('\n').map(line=>JSON.parse(line));assert.ok(rows.some(r=>r.messageWebhookSubscribed===true));assert.ok(rows.some(r=>r.detailHasSender&&r.detailHasContent));assert.equal(stateRevision(),before);
});
