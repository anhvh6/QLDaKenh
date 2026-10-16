import test from 'node:test';import assert from 'node:assert/strict';import {pageDataKey} from '../public/page-data-key.js';
test('background page keys ignore notifications and sync metadata but detect visible changes',()=>{
 const source={snapshotRevision:'1',contents:[{id:'p',title:'Original'}],assets:[{id:'a',url:'/video.mp4',usage:{count:1}}],connections:[{id:'ch',name:'Page',status:'connected',lastSyncedAt:'old'}],conversations:[{id:'c',status:'open',lastMessage:'Hello'}]};
 const next=structuredClone(source);next.snapshotRevision='2';next.notifications=[{id:'n'}];next.connections[0].lastSyncedAt='new';next.assets[0].usage.count=2;
 for(const route of ['dashboard','content'])assert.equal(pageDataKey(route,source),pageDataKey(route,next));
 next.contents[0].title='Changed';for(const route of ['dashboard','content'])assert.notEqual(pageDataKey(route,source),pageDataKey(route,next));
 next.contents=source.contents;next.conversations[0].lastMessage='New customer message';assert.equal(pageDataKey('content',source),pageDataKey('content',next));assert.notEqual(pageDataKey('dashboard',source),pageDataKey('dashboard',next));
});
