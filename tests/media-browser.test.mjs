import test from 'node:test';import assert from 'node:assert/strict';
import {mediaRows,mediaFolders,shortMediaName} from '../public/media-browser-model.js';
const assets=Array.from({length:35},(_,i)=>({id:String(i).padStart(2,'0'),name:'Ảnh '+i+'.png',type:i%2?'image':'video',createdAt:new Date(1700000000000+i*1000).toISOString(),categoryIds:i%2?['course']:[],usage:i<30?{count:1,lastAt:new Date(1750000000000+i*1000).toISOString()}:{count:0}}));
test('recent is at most 20 actually used images/videos; upload sorting and alternate order are deterministic',()=>{
 const recent=mediaRows(assets,{folder:'recent'});assert.equal(recent.length,20);assert.equal(recent[0].id,'29');assert.equal(recent.at(-1).id,'10');assert.equal(mediaRows(assets,{folder:'recent',sort:'oldest'})[0].id,'10');assert.equal(mediaRows(assets)[0].id,'34');assert.equal(assets[0].id,'00');
});
test('folders, favorites, search and type filters preserve membership and exclude inactive files',()=>{
 assert.equal(mediaRows(assets,{folder:'course'}).length,17);assert.deepEqual(mediaRows(assets,{folder:'favorites',favorites:['01','03']}).map(a=>a.id),['03','01']);assert.equal(mediaRows(assets,{folder:'recent',query:'Ảnh 29'}).length,1);assert.ok(mediaRows(assets,{folder:'recent',kind:'video'}).every(a=>a.type==='video'));
 const folders=mediaFolders([...assets,{id:'inactive',type:'image',active:false,usage:{count:5}}],[{id:'course',name:'Học viên',active:true}]);assert.equal(folders.find(f=>f.id==='recent').count,20);assert.equal(folders.find(f=>f.id==='course').count,17);
});
test('short media names retain the extension and full names remain available for tooltips',()=>{
 assert.equal(shortMediaName('a.png'),'a.png');const long='Ảnh chân dung hướng dẫn học viên sau sáu mươi ngày.png';assert.ok([...shortMediaName(long)].length<=26);assert.ok(shortMediaName(long).endsWith('.png'));assert.match(shortMediaName('x'.repeat(60)),/…$/);
});
