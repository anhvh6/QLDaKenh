import {randomBytes} from 'node:crypto';
try{process.loadEnvFile('.env');}catch{}
const {secret,saveSecret}=await import('../server/store.mjs');
const {remote}=await import('../server/connectors.mjs');
const id=process.env.META_APP_ID,key=process.env.META_APP_SECRET;
if(!id||!key)throw Error('Thiếu cấu hình ứng dụng Meta.');
const origin=new URL(process.env.OAUTH_BASE_URL||'https://quanlydakenh.vercel.app');
if(origin.protocol!=='https:')throw Error('Callback phải sử dụng HTTPS.');
let verifyToken=secret('meta-webhook').verifyToken;
if(!verifyToken){verifyToken=randomBytes(32).toString('hex');saveSecret('meta-webhook',{verifyToken});}
const callback=new URL('/api/webhooks/meta',origin).href;
const result=await remote(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v25.0'}/${id}/subscriptions`,{method:'POST',headers:{Authorization:'Bearer '+id+'|'+key,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({object:'page',callback_url:callback,verify_token:verifyToken,fields:'messages,message_echoes,message_reactions,feed'})});
if(!result.success)throw Error('Meta chưa xác nhận đăng ký callback.');
console.log(JSON.stringify({subscribed:true,callback}));
