import test from 'node:test';
import assert from 'node:assert/strict';
import {backgroundRefresh} from '../public/background-refresh.js';
test('bursts and slow requests are coalesced; unchanged realtime traffic cannot flood state API',async()=>{
 let calls=0,release;const refresh=backgroundRefresh(async()=>{calls++;await new Promise(r=>release=r);},{interval:30});
 const first=refresh();for(let i=0;i<100;i++)assert.equal(refresh(),first);
 await new Promise(r=>setTimeout(r,5));assert.equal(calls,1);for(let i=0;i<100;i++)assert.equal(refresh(),first);release();await first;
 const next=refresh();for(let i=0;i<100;i++)assert.equal(refresh(),next);await new Promise(r=>setTimeout(r,5));assert.equal(calls,1);await new Promise(r=>setTimeout(r,35));assert.equal(calls,2);release();await next;
});
test('hidden pages and open dialogs cannot issue a delayed refresh; explicit caller can retry after failure',async()=>{
 let allowed=true,calls=0;const refresh=backgroundRefresh(async()=>{calls++;throw Error('offline');},{allowed:()=>allowed,interval:15});
 await assert.rejects(refresh(),/offline/);allowed=false;assert.equal(await refresh(),false);assert.equal(calls,1);
 allowed=true;const next=refresh();allowed=false;assert.equal(await next,false);assert.equal(calls,1);allowed=true;await assert.rejects(refresh(),/offline/);assert.equal(calls,2);
});
