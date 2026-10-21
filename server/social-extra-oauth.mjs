import {secret,saveSecret} from './store.mjs';
import {extraProfile} from './social-extra.mjs';

export const extraOAuthRequirements={reddit:['REDDIT_CLIENT_ID','REDDIT_CLIENT_SECRET'],tumblr:['TUMBLR_CLIENT_ID','TUMBLR_CLIENT_SECRET'],mastodon:[]};
const scopes='read:accounts write:statuses';
const env=name=>{if(!process.env[name])throw new Error(`Chưa cấu hình ${name}.`);return process.env[name];};
const formRequest=body=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'QLDaKenh/2.1 (social account integration)'},body:new URLSearchParams(body)});
export function extraAuthorization(c,state,redirect,remote){
 if(c.provider==='mastodon')return mastodonAuthorization(state,redirect,remote);
 const params={client_id:env(`${c.provider.toUpperCase()}_CLIENT_ID`),response_type:'code',redirect_uri:redirect,state,scope:c.provider==='reddit'?'identity submit':'basic write offline_access',...(c.provider==='reddit'?{duration:'permanent'}:{})};
 env(`${c.provider.toUpperCase()}_CLIENT_SECRET`);
 return {url:`${c.provider==='reddit'?'https://www.reddit.com/api/v1/authorize':'https://www.tumblr.com/oauth2/authorize'}?${new URLSearchParams(params)}`,redirectUri:redirect};
}
async function mastodonAuthorization(state,redirect,remote){
 const app=await remote('https://mastodon.social/api/v1/apps',formRequest({client_name:'MeGa Phuong Social & Care',redirect_uris:redirect,scopes,website:new URL(redirect).origin}));
 if(!app.client_id||!app.client_secret)throw new Error('Mastodon chưa cấp thông tin ứng dụng.');
 saveSecret(`oauth:${state}`,{clientId:app.client_id,clientSecret:app.client_secret});
 return {url:`https://mastodon.social/oauth/authorize?${new URLSearchParams({client_id:app.client_id,redirect_uri:redirect,response_type:'code',scope:scopes,state})}`,redirectUri:redirect};
}
export async function exchangeExtra(provider,code,redirect,state,connection,remote){
 let tokens;
 if(provider==='mastodon'){
  const app=secret(`oauth:${state}`);if(!app.clientId||!app.clientSecret)throw new Error('Phiên Mastodon đã hết hạn.');
  tokens=await remote('https://mastodon.social/oauth/token',formRequest({client_id:app.clientId,client_secret:app.clientSecret,code,redirect_uri:redirect,grant_type:'authorization_code'}));
 }else{
  const values={code,redirect_uri:redirect,grant_type:'authorization_code'},request=formRequest(values);
  if(provider==='reddit')request.headers.Authorization=`Basic ${Buffer.from(`${env('REDDIT_CLIENT_ID')}:${env('REDDIT_CLIENT_SECRET')}`).toString('base64')}`;
  else request.body=new URLSearchParams({...values,client_id:env('TUMBLR_CLIENT_ID'),client_secret:env('TUMBLR_CLIENT_SECRET')});
  tokens=await remote(provider==='reddit'?'https://www.reddit.com/api/v1/access_token':'https://api.tumblr.com/v2/oauth2/token',request);
 }
 if(!tokens.access_token)throw new Error('Nền tảng chưa cấp access token.');
 const profile=await extraProfile(connection,remote,tokens.access_token);
 return {...profile,token:tokens.access_token,refreshToken:tokens.refresh_token,expiresIn:tokens.expires_in};
}
