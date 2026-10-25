import test from 'node:test';import assert from 'node:assert/strict';
import {listDriveFiles} from '../server/drive-files.mjs';
test('Drive listing uses current user credential, metadata only, 20 files and page token',async()=>{
 const result=await listDriveFiles({id:'current'},new URL('https://app.test/api/drive/files?parent=folder_123&pageToken=next-token'),{access:async id=>{assert.equal(id,'current');return 'private';},google:async(raw,options)=>{const url=new URL(raw);assert.equal(url.origin,'https://www.googleapis.com');assert.equal(options.headers.Authorization,'Bearer private');assert.equal(url.searchParams.get('pageSize'),'20');assert.equal(url.searchParams.get('pageToken'),'next-token');assert.equal(url.searchParams.get('q'),"trashed=false and 'folder_123' in parents");assert.equal(url.searchParams.has('alt'),false);return {files:[{id:'file',name:'Photo.jpg'}],nextPageToken:'page2'};}});assert.equal(result.nextPageToken,'page2');
});
test('Drive rejects injected parent queries before requesting credentials',async()=>{
 let calls=0;await assert.rejects(listDriveFiles({id:'a'},new URL('https://app.test/api/drive/files?parent='+encodeURIComponent("a' or trashed=true")),{access:()=>calls++,google:()=>calls++}),e=>e.status===400);assert.equal(calls,0);
});
