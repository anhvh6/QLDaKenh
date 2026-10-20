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
