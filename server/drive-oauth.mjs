import {createHash,randomBytes} from 'node:crypto';
import {db,secret,saveSecret} from './store.mjs';
import {permission,fail} from './domain.mjs';

const flowKey=state=>'drive-flow-'+createHash('sha256').update(state).digest('hex');
export function cancelDriveOAuth(user){const previous=secret('drive-state-'+user.id);if(previous.state)saveSecret(flowKey(previous.state),{});saveSecret('drive-state-'+user.id,{});}
export function beginDriveOAuth(user){
 permission(user,'content');
 const app=secret('drive-oauth');
 if(!app.clientId||!app.clientSecret)fail('Chưa cấu hình Google OAuth Client ID và Secret.');
 cancelDriveOAuth(user);
 const state=randomBytes(32).toString('hex'),expires=Date.now()+600000;
 saveSecret('drive-state-'+user.id,{state,expires});
 saveSecret(flowKey(state),{userId:user.id,expires,clientId:app.clientId,redirectUri:app.redirectUri});
 return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:app.clientId,redirect_uri:app.redirectUri,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'select_account consent',state})};
}
export async function completeDriveOAuth(url){
 const state=url.searchParams.get('state')||'';
 if(!/^[a-f0-9]{64}$/.test(state))fail('Phiên kết nối Google không hợp lệ. Bấm Kết nối Google Drive để thử lại.',403);
 const key=flowKey(state),flow=secret(key),expected=flow.userId?secret('drive-state-'+flow.userId):{};
 if(!flow.userId||!Number.isFinite(flow.expires)||flow.expires<=Date.now()||expected.state!==state)fail('Phiên kết nối Google hết hạn. Bấm Kết nối Google Drive để thử lại.',403);
 // Consume synchronously before awaiting Google so the state cannot be replayed.
 saveSecret(key,{});saveSecret('drive-state-'+flow.userId,{});
 const user=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(flow.userId);
 if(!user?.active)fail('Tài khoản bắt đầu kết nối không còn hoạt động.',403);
 permission(user,'content');
 if(url.searchParams.has('error'))fail('Bạn chưa cấp quyền Google Drive. Có thể kết nối lại.');
 const code=url.searchParams.get('code');if(!code)fail('Google chưa trả mã xác thực. Kết nối lại.');
 const app=secret('drive-oauth');
 if(app.clientId!==flow.clientId||app.redirectUri!==flow.redirectUri)fail('Cấu hình Google đã thay đổi trong lúc kết nối. Kết nối lại.',409);
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:app.clientId,client_secret:app.clientSecret,redirect_uri:flow.redirectUri,code,grant_type:'authorization_code'}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok)fail(result.error_description||'Google từ chối mã xác thực: '+(result.error||response.status),502);
 if(!result.refresh_token||!result.access_token)fail('Google không cấp quyền truy cập dài hạn. Kết nối lại.');
 const identityResponse=await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)',{headers:{Authorization:'Bearer '+result.access_token},signal:AbortSignal.timeout(30000)});
 const identity=await identityResponse.json();
 if(!identityResponse.ok||!identity.user?.emailAddress)fail(identity.error?.message||'Không xác minh được tài khoản Google Drive. Kết nối lại.',502);
 const previous=secret('drive-'+user.id),account=identity.user.emailAddress;
 saveSecret('drive-'+user.id,{...previous,...(previous.account&&previous.account.toLowerCase()!==account.toLowerCase()?{folderId:''}:{}),account,refreshToken:result.refresh_token,googleClientId:app.clientId,googleClientSecret:app.clientSecret});
 return {ok:true,message:'Đã kết nối Google Drive.'};
}
