import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleOAuthClient,googleRefreshClient} from '../server/google-oauth-client.mjs';
const environment={GOOGLE_CLIENT_ID:'legacy-id',GOOGLE_CLIENT_SECRET:'legacy-secret'};
test('existing channels retain legacy application',()=>{
 assert.deepEqual(googleOAuthClient({},()=>{throw Error('unexpected secret read');},environment),{clientId:'legacy-id',clientSecret:'legacy-secret'});
 assert.deepEqual(googleRefreshClient({refreshToken:'old'},environment),{clientId:'legacy-id',clientSecret:'legacy-secret'});
});
test('new channel and token refresh use their own application',()=>{
 const client=googleOAuthClient({googleOAuthClientKey:'new'},key=>{assert.equal(key,'google-oauth-client:new');return {clientId:'new-id',clientSecret:'new-secret'};},environment);
 assert.deepEqual(googleRefreshClient({googleClientId:client.clientId,googleClientSecret:client.clientSecret},environment),client);
});
test('missing binding never silently switches to legacy credentials',()=>{
 assert.throws(()=>googleOAuthClient({googleOAuthClientKey:'missing'},()=>({}),environment));
 assert.throws(()=>googleRefreshClient({googleClientId:'new-id'},environment));
});
