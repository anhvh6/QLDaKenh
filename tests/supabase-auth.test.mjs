import test from 'node:test';import assert from 'node:assert/strict';
import {supabaseAuth} from '../server/supabase-auth.mjs';
test('slow auth does not block timers; concurrent callers share one refresh and warm token',async()=>{
 let release,calls=0,time=0,timerRan=false;
 const auth=supabaseAuth({url:'https://example.test',key:'qa',email:'qa',password:'qa',clock:()=>time,fetcher:async()=>{calls++;await new Promise(r=>release=r);return Response.json({access_token:'token-'+calls,expires_in:120});}});
 const a=auth(),b=auth();await new Promise(r=>setTimeout(()=>{timerRan=true;r();},20));assert.equal(timerRan,true);assert.equal(calls,1);release();assert.deepEqual(await a,await b);assert.match((await auth()).Authorization,/token-1/);
 time=61000;const c=auth(),d=auth();assert.equal(calls,2);release();assert.deepEqual(await c,await d);
});
test('auth failure clears pending promise and can retry; invalid token is rejected',async()=>{
 let calls=0;const auth=supabaseAuth({url:'https://example.test',key:'qa',fetcher:async()=>++calls===1?Response.json({}, {status:503}):Response.json({access_token:'ok',expires_in:3600})});await assert.rejects(auth(),/Auth Failed/);assert.match((await auth()).Authorization,/ok/);
 const bad=supabaseAuth({url:'https://example.test',fetcher:async()=>Response.json({})});await assert.rejects(bad(),/Auth Invalid/);
});
