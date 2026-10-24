import test from 'node:test';
import assert from 'node:assert/strict';
import {unreadCommentCount,visibleComment,commentMatchesTags,commentLikeState} from '../public/comment-presentation.js';
test('comment unread badge excludes private messages, removed comments and unavailable channels',()=>{
 const S={connections:[{id:'live',status:'connected'},{id:'off',status:'disconnected'}],conversations:[{id:'new'},{id:'dm',kind:'message'},{id:'read',unread:false},{id:'removed',remoteDeleted:true},{id:'deleted',deletedAt:'2026-10-20'},{id:'offline',connectionId:'off'}].map(c=>({kind:'comment',connectionId:'live',unread:true,...c}))};
 assert.equal(unreadCommentCount(S),1);assert.deepEqual(S.conversations.filter(c=>visibleComment(S,c)&&c.unread).map(c=>c.id),['new']);S.conversations[0].unread=false;assert.equal(unreadCommentCount(S),0);
});
test('comment tags accept all, a single tag, or any of multiple tags without mixing private-chat tags',()=>{
 const c={tags:['Nhận xét','Đợi lịch']};assert.equal(commentMatchesTags(c,[]),true);assert.equal(commentMatchesTags(c,['Nhận xét']),true);assert.equal(commentMatchesTags(c,['Khách mới']),false);assert.equal(commentMatchesTags(c,['Khách mới','Đợi lịch']),true);assert.equal(commentMatchesTags({},['Nhận xét']),false);
});
test('Like updates count immediately, stays idempotent, and never goes negative',()=>{
 const m={id:'a',liked:false,likeCount:2};const liked=commentLikeState(m,true);assert.equal(liked.likeCount,3);assert.equal(m.likeCount,2);assert.equal(commentLikeState(liked,true).likeCount,3);assert.equal(commentLikeState(liked,false).likeCount,2);assert.equal(commentLikeState({liked:true},false).likeCount,0);
});

import {commentCardTime} from '../public/comment-presentation.js';
import {commentPostMedia} from '../public/comment-post-media.js';
import {commentPostText,commentPostMediaHTML} from '../public/comment-detail.js';
test('comment cards use Vietnam today, otherwise dd/mm across UTC midnight and year boundaries',()=>{
 const now='2026-10-20T01:00:00Z';assert.equal(commentCardTime('2026-10-19T18:30:00Z',now),'01:30');assert.equal(commentCardTime('2026-10-19T16:30:00Z',now),'19/10');assert.equal(commentCardTime('2025-12-31T10:00:00Z',now),'31/12');assert.equal(commentCardTime('bad',now),'');
});
test('original post supports albums, direct videos, Instagram media and YouTube embeds',()=>{
 const media=commentPostMedia({full_picture:'https://cdn.test/cover.jpg',attachments:{data:[{subattachments:{data:[{type:'photo',media:{image:{src:'https://cdn.test/photo.jpg'}}},{type:'video_inline',media:{source:'https://cdn.test/clip.mp4',image:{src:'https://cdn.test/poster.jpg'}}}]}}]}});
 assert.deepEqual(media.map(x=>x.type),['image','video']);assert.equal(media[1].poster,'https://cdn.test/poster.jpg');assert.equal(commentPostMedia({media_type:'VIDEO',media_url:'https://cdn.test/reel.mp4'})[0].type,'video');assert.equal(commentPostMedia({url:'https://www.youtube.com/watch?v=abcdefghijk'})[0].type,'embed');
 assert.deepEqual(commentPostMedia({full_picture:'javascript:alert(1)'}),[]);
 const html=commentPostMediaHTML({media});assert.match(html,/<img /);assert.match(html,/data-comment-video=/);assert.doesNotMatch(html,/<video |<iframe /);assert.doesNotMatch(html,/autoplay/);
 assert.equal(commentPostMediaHTML({media:[{type:'embed',url:'https://evil.test/'}]}),'<div class="comment-post-media"></div>');
});
test('long original text is collapsed with native Show more and safely escaped',()=>{
 const html=commentPostText('a'.repeat(500)+'<script>bad</script>');assert.match(html,/<details class="comment-post-text">/);assert.match(html,/Xem thêm/);assert.match(html,/Thu gọn/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(commentPostText('short'),/<details/);
});
