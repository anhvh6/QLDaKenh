import test from 'node:test';
import assert from 'node:assert/strict';
import {commentPostMediaNeedsSave} from '../server/comment-media-refresh.mjs';

const hour=3600000,now=Date.parse('2026-11-07T12:00:00Z');
const media=(sig,host='scontent.fhan5-11.fna.fbcdn.net')=>[{type:'image',url:`https://${host}/v/t39.30808-6/509736271_n.jpg?oh=${sig}&oe=6AEA8D5F`}];

test('rotating CDN signatures and edge hosts do not trigger a write while the saved links are fresh',()=>{
 const conversation={postMedia:media('aaa'),postMediaAt:new Date(now-hour).toISOString()};
 assert.equal(commentPostMediaNeedsSave(conversation,media('bbb'),now),false);
 assert.equal(commentPostMediaNeedsSave(conversation,media('ccc','scontent.fhan15-1.fna.fbcdn.net'),now),false);
});

test('a different asset, a different type or an embed with another href is saved',()=>{
 const conversation={postMedia:media('aaa'),postMediaAt:new Date(now).toISOString()};
 assert.equal(commentPostMediaNeedsSave(conversation,[{type:'image',url:'https://scontent.x/v/other.jpg?oh=1'}],now),true);
 assert.equal(commentPostMediaNeedsSave(conversation,[{type:'video',url:media('aaa')[0].url}],now),true);
 const embedA={postMedia:[{type:'embed',url:'https://www.facebook.com/plugins/video.php?href=a'}],postMediaAt:new Date(now).toISOString()};
 assert.equal(commentPostMediaNeedsSave(embedA,[{type:'embed',url:'https://www.facebook.com/plugins/video.php?href=b'}],now),true);
 assert.equal(commentPostMediaNeedsSave(embedA,embedA.postMedia,now),false);
});

test('expiring links are refreshed after 12 hours and legacy rows without a timestamp are saved once',()=>{
 const old={postMedia:media('aaa'),postMediaAt:new Date(now-13*hour).toISOString()};
 assert.equal(commentPostMediaNeedsSave(old,media('bbb'),now),true);
 assert.equal(commentPostMediaNeedsSave({postMedia:media('aaa')},media('bbb'),now),true);
 assert.equal(commentPostMediaNeedsSave({},media('bbb'),now),true);
});

test('nothing is saved when the post has no media',()=>{
 assert.equal(commentPostMediaNeedsSave({postMedia:media('aaa')},[],now),false);
 assert.equal(commentPostMediaNeedsSave({},undefined,now),false);
});
