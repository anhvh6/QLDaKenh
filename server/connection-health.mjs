import {get,put,secret,db} from './store.mjs';
export function connectionFailure(error={}){
 const code=String(error.providerCode||''),http=Number(error.providerStatus||0);
 if(error.reconnectRequired||http===401||['invalid_grant','invalid_client','unauthorized_client','190'].includes(code))return 'auth_required';
 if(http===429||['quotaExceeded','rateLimitExceeded','80002'].includes(code))return 'rate_limited';
 if(http===403&&error.responseFormat!=='html')return 'permission_required';
 if(error.networkCode||error.retryable||http>=500||error.responseFormat==='html')return 'temporary_error';
 return 'error';
}
export function recordConnectionCheck(c,error=null,source='profile'){
 const current=get('connections',c.id);if(!current||current.deletedAt||current.status==='disconnected')return;
 const s=secret(c.id);let message=error?String(error.message||'Không kiểm tra được API.'):'Đọc thông tin kênh thành công.';
 for(const value of [s.token,s.refreshToken,s.googleClientSecret,s.appSecret].filter(Boolean))message=message.split(String(value)).join('[redacted]');
 message=message.replace(/https?:\/\/\S+/g,'[đường dẫn]').slice(0,700);
 const key=source==='publish'?'publishingCheck':'connectionCheck',previous=current[key]||{},checkedAt=new Date().toISOString();
 const saved=put('connections',{...current,[key]:{status:error?connectionFailure(error):'ok',checkedAt,lastSuccessAt:error?previous.lastSuccessAt:checkedAt,message,code:String(error?.providerCode||''),http:error?.providerStatus||null},...(!error&&source==='profile'?{verifiedAt:checkedAt,oauthError:'',...(current.health?{health:{...current.health,checks:current.health.checks.filter(x=>x.key!=='profile')}}:{})}:{})});
 // Routine sync timestamps intentionally do not invalidate state; user-visible
 // health results must invalidate both the snapshot and collection caches.
 db.prepare('UPDATE state_revision SET value=value+1 WHERE id=1').run();
 db.prepare("INSERT INTO kind_revision VALUES('connections',1) ON CONFLICT(kind) DO UPDATE SET value=value+1").run();
 return saved;
}
