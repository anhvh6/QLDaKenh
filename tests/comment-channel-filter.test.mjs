import test from 'node:test';
import assert from 'node:assert/strict';
import {commentChannels,toggleCommentChannel,commentChannelPicker,commentChannelHealth} from '../public/comment-channel-filter.js';
const channels=[{id:'a',provider:'facebook',name:'Page',remoteName:'Page A',status:'connected'},{id:'b',provider:'instagram',name:'B',status:'connected'}];
test('comment channel selection supports all, none, single and multiple connected comment channels',()=>{
 assert.deepEqual(commentChannels([...channels,{id:'off',provider:'facebook',status:'disconnected'},{id:'chat',provider:'zalo_personal',status:'connected'}]),channels);
 assert.deepEqual(toggleCommentChannel(null,channels,'a',false),['b']);
 assert.deepEqual(toggleCommentChannel(['b'],channels,'b',false),[]);
 assert.deepEqual(toggleCommentChannel([],channels,'a',true),['a']);
 assert.equal(toggleCommentChannel(['a'],channels,'b',true),null);
 assert.equal(toggleCommentChannel([],channels,'all',true),null);
 assert.deepEqual(toggleCommentChannel(null,channels,'all',false),[]);
});
test('channel picker uses exact names and safely escapes channels',()=>{
 const html=commentChannelPicker(channels,['a'],true);assert.match(html,/Page A/);assert.match(html,/data-comment-channel="a" checked/);assert.match(html,/open/);
 const unsafe=commentChannelPicker([{...channels[0],remoteName:'<script>bad</script>'}],null);assert.doesNotMatch(unsafe,/<script>/);
});

test('channel dropdown shows platform, channel and sync errors without a separate status panel',()=>{
 const html=commentChannelPicker(channels,null,false,[{id:'a',status:'error',error:'Token <expired>',supported:true},{id:'b',status:'ready',supported:true,missingAuthorCount:3}]);
 assert.match(html,/class="social facebook"/);assert.match(html,/Page A/);assert.match(html,/Token &lt;expired&gt;/);assert.match(html,/3 bình luận/);assert.match(html,/comment-filter-check checked/);assert.doesNotMatch(html,/Trạng thái đồng bộ kênh/);
 assert.equal(commentChannelHealth({status:'error',error:'Không có quyền'}).error,true);
 assert.equal(commentChannelHealth({status:'ready',supported:true}).text,'Đã đồng bộ');
});
