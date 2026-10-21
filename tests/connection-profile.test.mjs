import test from 'node:test';import assert from 'node:assert/strict';
import {connectionProfileURL} from '../public/connection-profile.js';
test('channel profile navigation preserves verified HTTPS profiles and uses account-specific URLs',()=>{
 assert.equal(connectionProfileURL({provider:'facebook',accountId:'12345'}),'https://www.facebook.com/profile.php?id=12345');
 assert.equal(connectionProfileURL({provider:'instagram',expectedAccount:'@faceyoga.megaphuong'}),'https://www.instagram.com/faceyoga.megaphuong/');
 assert.equal(connectionProfileURL({provider:'youtube',accountId:'UCtest123'}),'https://www.youtube.com/channel/UCtest123');
 assert.equal(connectionProfileURL({provider:'mastodon',expectedAccount:'@faceyoga@mastodon.social'}),'https://mastodon.social/@faceyoga');
 assert.equal(connectionProfileURL({provider:'blogger',profileUrl:'https://example.blogspot.com/'}),'https://example.blogspot.com/');
 assert.equal(connectionProfileURL({provider:'facebook',profileUrl:'javascript:alert(1)'}),'https://www.facebook.com/');
 assert.equal(connectionProfileURL({provider:'facebook',profileUrl:'http://example.test'}),'https://www.facebook.com/');
});
