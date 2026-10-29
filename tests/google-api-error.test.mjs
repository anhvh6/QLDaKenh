import test from 'node:test';
import assert from 'node:assert/strict';
import {googleAPIError} from '../server/google-api-error.mjs';

test('OAuth string errors retain cause and explain reconnection without raw credentials',()=>{
  const error=googleAPIError('https://oauth2.googleapis.com/token',{error:'invalid_grant',error_description:'Token has been expired or revoked.'});
  assert.equal(error.code,'invalid_grant'); assert.equal(error.reconnectRequired,true);
  assert.match(error.message,/kết nối lại/); assert.doesNotMatch(error.message,/API trả về 400/);
});
test('Google resource reason takes precedence over generic numeric HTTP code',()=>{
  const error=googleAPIError('https://www.googleapis.com/upload/youtube/v3/videos',{error:{code:400,message:'Bad Request',errors:[{reason:'invalidTitle'}]}});
  assert.equal(error.code,'invalidTitle'); assert.match(error.message,/tiêu đề/);
});
test('unknown Google validation errors preserve explanation, non-Google errors stay untouched',()=>{
  assert.equal(googleAPIError('https://www.googleapis.com/blogger/v3/blogs/1/posts',{error:{code:400,message:'Invalid label'}}).message,'Invalid label');
  assert.equal(googleAPIError('https://graph.facebook.com/v25.0/me',{error:{code:190}}),null);
});
