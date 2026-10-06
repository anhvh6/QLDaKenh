import { Zalo, ThreadType } from 'zca-js';
import {imageSizeFromFile} from 'image-size/fromFile';
import {stat} from 'node:fs/promises';
import { db, put, get, all, now, transaction, saveSecret, secret } from './store.mjs';
import { runWorkflows } from './domain.mjs';
import { captureLead } from './taophacdo.mjs';

const instances=new Map(), logins=new Map(), jobs=new Map();
export async function imageMetadataGetter(path){const [dimensions,file]=await Promise.all([imageSizeFromFile(path),stat(path)]);return {width:dimensions.width,height:dimensions.height,size:file.size};}
const client=()=>new Zalo({selfListen:true,checkUpdate:false,logging:false,imageMetadataGetter});
function channel(id){const c=get('connections',id);if(!c||c.provider!=='zalo_personal')throw new Error('Không tìm thấy kênh Zalo cá nhân.');return c;}
function state(id,patch){return put('connections',{...channel(id),...patch});}
function syncState(id,patch){state(id,{zaloSync:{...channel(id).zaloSync,...patch,updatedAt:now()}});}
function conversation(id,thread,type=0,name){
 const row=db.prepare("SELECT id FROM records WHERE kind='conversations' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.externalUserId')=? AND coalesce(json_extract(data,'$.threadType'),0)=?").get(id,thread,type);
 if(row)return get('conversations',row.id);
 const c=put('customers',{name:name||`${type===1?'Nhóm Zalo':'Zalo'} ${thread}`,phone:'',tags:[],consent:false,origin:'zalo'});
 return put('conversations',{customerId:c.id,connectionId:id,externalUserId:thread,threadType:type,kind:'message',status:'open',tags:[],mode:'api',unread:false,lastAt:'1970-01-01T00:00:00.000Z',lastMessage:''});
}
function timestamp(value){const n=Number(value);const d=new Date(Number.isFinite(n)&&n>0?(n<1e12?n*1000:n):value);return Number.isFinite(d.getTime())?d.toISOString():now();}
function messageText(data){if(typeof data.content==='string')return data.content;const c=data.content||{};return [c.title,c.description].filter(x=>typeof x==='string'&&x).join('\n')||`[${data.msgType||'Tệp đính kèm / nhãn dán'}]`;}
function mediaOf(data){const c=data.content;if(!c||typeof c!=='object')return [];const url=c.href||c.hdUrl||c.normalUrl||c.thumb;if(typeof url!=='string'||!/^https:\/\//i.test(url))return [];return [{url,name:String(c.title||data.msgType||'Tệp Zalo'),type:/photo|image/i.test(data.msgType)?'image':/video/i.test(data.msgType)?'video':'file'}];}
export function ingestMessage(id,message,{history=false}={}){
 channel(id);const data=message?.data,thread=String(message?.threadId||''),externalId=String(data?.msgId||'');
 if(!data||!thread||!externalId)throw new Error('Tin nhắn Zalo thiếu định danh.');
 const type=message.type===ThreadType.Group?ThreadType.Group:ThreadType.User,text=messageText(data),at=timestamp(data.ts);
 return transaction(()=>{
  const conv=conversation(id,thread,type,type===ThreadType.Group?`Nhóm Zalo ${thread}`:message.isSelf?undefined:data.dName);
  const rows=db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.externalId')=?").all(conv.id,externalId);
  if(rows.length)return false;
  // The self echo may arrive before sendMessage resolves; match only the pending send in this conversation.
  const pending=message.isSelf&&!history?db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='outgoing' AND json_extract(data,'$.status')='sending' AND json_extract(data,'$.text')=?").all(conv.id,text):[];
  const previous=pending.length===1?get('messages',pending[0].id):null;
  const quoteSource=Object.fromEntries(['content','msgType','propertyExt','uidFrom','msgId','cliMsgId','ts','ttl'].map(k=>[k,data[k]]));
  const msg=put('messages',{...previous,conversationId:conv.id,direction:message.isSelf?'outgoing':'incoming',text,externalId,externalClientId:String(data.cliMsgId||''),senderId:String(data.uidFrom||''),senderName:String(data.dName||''),messageType:data.msgType||'text',attachments:mediaOf(data),quoteSource,status:message.isSelf?'sent':'received',createdAt:at,sentAt:at,history});
  const latest=Date.parse(at)>=Date.parse(conv.lastAt||0);
  put('conversations',{...conv,...(latest?{lastMessage:text,lastAt:at}:{}),...(!history&&!message.isSelf?{unread:true,status:'open',lastInboundAt:at,waitingSince:conv.waitingSince||at}:{}),...(message.isSelf&&!history&&latest?{waitingSince:null,slaAlerted:false}:{})});
  db.prepare('INSERT OR IGNORE INTO events(id,source,received_at,payload) VALUES(?,?,?,?)').run(`zalo:${id}:${type}:${thread}:${externalId}`,id,now(),JSON.stringify({messageId:msg.id,history}));
  if(!history&&!message.isSelf){runWorkflows('message_received',msg);captureLead(get('conversations',conv.id),msg);}
  return true;
 });
}
export function importFriends(id,friends){
 if(!Array.isArray(friends))throw new Error('Zalo trả danh bạ không hợp lệ.');
 return transaction(()=>{let count=0;for(const f of friends){const thread=String(f.userId||f.uid||f.id||'');if(!thread)continue;const conv=conversation(id,thread,ThreadType.User,f.displayName||f.zaloName);const c=get('customers',conv.customerId);put('customers',{...c,name:c.nameEditedLocally?c.name:(f.displayName||f.zaloName||c.name),zaloAvatar:f.avatar||c.zaloAvatar,zaloUserId:thread});count++;}return count;});
}
function waitReady(r){if(r.ready)return Promise.resolve();return new Promise((resolve,reject)=>{const t=setTimeout(()=>{r.api.listener.off('cipher_key',ready);reject(new Error('Chưa nhận khóa đồng bộ từ Zalo. Thử lại khi kết nối ổn định.'));},15000);const ready=()=>{clearTimeout(t);resolve();};r.api.listener.once('cipher_key',ready);});}
function historyPage(r,type,cursor){return new Promise((resolve,reject)=>{
 const done=(messages,eventType)=>{if(type!==eventType)return;cleanup();if(r.historyError)reject(new Error(r.historyError));else resolve(messages);};
 const fail=()=>{cleanup();reject(new Error('Kết nối gián đoạn khi tải lịch sử.'));};
 const timer=setTimeout(()=>{cleanup();reject(new Error('Zalo chưa trả lịch sử; hãy thử đồng bộ lại.'));},15000);
 const cleanup=()=>{clearTimeout(timer);r.api.listener.off('old_messages',done);r.api.listener.off('disconnected',fail);};
 r.api.listener.on('old_messages',done);r.api.listener.once('disconnected',fail);
 try{r.api.listener.requestOldMessages(type,cursor);}catch(e){cleanup();reject(e);}
});}
export async function syncZaloData(id,api,options={}){
 const r=instances.get(id);if(!r||r.api!==api)throw new Error('Phiên Zalo không còn hoạt động.');
 r.historyError='';syncState(id,{status:'running',contacts:0,messages:0,error:'',startedAt:now()});let contacts=0,messages=0;
 try{
  const seen=new Set();let friendsComplete=false;for(let page=1;page<=40;page++){
   const friends=await api.getAllFriends(500,page);if(!Array.isArray(friends))throw new Error('Zalo trả danh bạ không hợp lệ.');
   if(instances.get(id)!==r)throw new Error('Phiên Zalo đã dừng.');
   const fresh=friends.filter(f=>!seen.has(String(f.userId)));for(const f of fresh)seen.add(String(f.userId));
   contacts+=importFriends(id,fresh);syncState(id,{contacts});if(friends.length<500){friendsComplete=true;break;}if(!fresh.length)break;
  }
  if(friendsComplete)transaction(()=>{for(const c of all('conversations').filter(c=>c.connectionId===id&&c.threadType!==1))put('conversations',{...c,isFriend:seen.has(String(c.externalUserId)),...(seen.has(String(c.externalUserId))?{friendRequestPending:false}:{})});});
  await waitReady(r);let limited=false;
  const cursors=options.older?{...channel(id).zaloSync?.cursors}:{};
  for(const type of [ThreadType.User,ThreadType.Group]){
   let cursor=cursors[type]||null;const visited=new Set();
   for(let page=0;page<30;page++){
    if(instances.get(id)!==r)throw new Error('Phiên Zalo đã dừng.');
    const batch=await historyPage(r,type,cursor);if(!batch.length){cursors[type]=null;break;}
    messages+=batch.length;const ids=batch.map(m=>String(m.data?.msgId||'')).filter(x=>/^\d+$/.test(x));
    const next=ids.reduce((a,b)=>!a||BigInt(b)<BigInt(a)?b:a,'');
    if(!next||visited.has(next)||next===cursor){cursors[type]=null;break;}visited.add(next);cursor=next;cursors[type]=cursor;
    syncState(id,{messages,cursors});if(page===29)limited=true;
   }
  }
  syncState(id,{status:limited?'partial':'complete',contacts,messages,cursors,finishedAt:now(),note:limited?'Còn lịch sử: chọn Tải thêm lịch sử.':'Đã tải phần lịch sử Zalo cung cấp cho phiên này; không bảo đảm toàn bộ tin trên điện thoại.'});
 }catch(e){syncState(id,{status:contacts||messages?'partial':'failed',contacts,messages,error:e.message,finishedAt:now()});throw e;}
 return channel(id).zaloSync;
}
function startSync(id,r,options={}){if(jobs.has(id))return jobs.get(id);const job=syncZaloData(id,r.api,options).finally(()=>jobs.delete(id));jobs.set(id,job);job.catch(()=>{});return job;}
export function setupListener(id,api,{autoSync=true}={}){
 const old=instances.get(id);if(old){instances.delete(id);old.api.listener.stop();}
 const r={api,ready:false};instances.set(id,r);const live=()=>instances.get(id)===r;
 api.listener.on('message',m=>{if(!live())return;try{ingestMessage(id,m);}catch{state(id,{listenerError:'Không lưu được tin Zalo; hãy đồng bộ lại.'});}});
 api.listener.on('old_messages',batch=>{if(!live())return;try{for(const m of batch)ingestMessage(id,m,{history:true});}catch{r.historyError='Không lưu được một phần lịch sử Zalo.';syncState(id,{status:'failed',error:r.historyError});}});
 api.listener.on('connected',()=>{if(live())state(id,{status:'connected',mode:'api',listenerState:'waiting_key',verifiedAt:now(),listenerError:''});});
 api.listener.on('cipher_key',()=>{if(!live())return;r.ready=true;startGroupNames(id,api);state(id,{status:'connected',listenerState:'listening',listenerError:''});if(autoSync)startSync(id,r);});
 api.listener.on('disconnected',()=>{if(!live())return;r.ready=false;state(id,{status:'reconnecting',listenerState:'reconnecting'});});
 api.listener.on('closed',code=>{if(!live())return;r.ready=false;state(id,{status:'error',listenerState:'closed',listenerError:[3000,3003].includes(code)?'Phiên bị ngắt bởi đăng nhập Zalo Web khác. Đóng phiên trùng rồi kết nối lại.':'Phiên nghe đã dừng. Bấm Đồng bộ để khôi phục hoặc quét QR lại.'});instances.delete(id);});
 api.listener.on('error',()=>{if(live())state(id,{listenerError:'Kết nối Zalo gặp lỗi; đang chờ khôi phục.'});});
 state(id,{status:'connecting',listenerState:'connecting'});api.listener.start({retryOnClose:true});return r;
}
export async function createQR(id){
 channel(id);logins.get(id)?.abort?.();const ticket={};logins.set(id,ticket);state(id,{status:'pending',listenerError:''});
 return new Promise((resolve,reject)=>{
  let settled=false;const timer=setTimeout(()=>{ticket.abort?.();if(!settled){settled=true;reject(new Error('Hết thời gian lấy mã QR Zalo.'));}},120000);timer.unref?.();
  client().loginQR({},event=>{
   if(logins.get(id)!==ticket)return;ticket.abort=event.actions?.abort||ticket.abort;
   if(event.type===0&&!settled){settled=true;resolve({image:event.data.image,code:event.data.code});}
   if(event.type===2)state(id,{status:'scanned',name:event.data.display_name});
   if(event.type===1||event.type===3){state(id,{status:event.type===1?'expired':'declined'});ticket.abort?.();}
   if(event.type===4)saveSecret(`zalo_session_${id}`,event.data);
  }).then(api=>{clearTimeout(timer);if(logins.get(id)!==ticket){api.listener.stop();return;}logins.delete(id);setupListener(id,api);}).catch(()=>{clearTimeout(timer);if(logins.get(id)===ticket){logins.delete(id);state(id,{status:'error',listenerError:'Đăng nhập Zalo chưa hoàn tất. Tạo QR và thử lại.'});}if(!settled){settled=true;reject(new Error('Không lấy được mã QR Zalo.'));}});
 });
}
async function resume(id){const sess=secret(`zalo_session_${id}`);if(!sess.cookie)throw new Error('Chưa có phiên Zalo. Hãy quét QR.');const api=await client().login(sess);return setupListener(id,api);}
export async function recoverSessions(){for(const c of all('connections').filter(c=>c.provider==='zalo_personal'&&c.mode==='api'&&c.status!=='disconnected')){try{await resume(c.id);}catch{state(c.id,{status:'error',listenerError:'Không khôi phục được phiên. Hãy quét QR lại.'});}}}
export async function forceSync(id,options={}){channel(id);const r=instances.get(id)||await resume(id);startGroupNames(id,r.api);startSync(id,r,options);return {success:true,message:'Đã bắt đầu đồng bộ danh bạ và lịch sử. Xem tiến độ trên thẻ kênh.',sync:channel(id).zaloSync};}
export async function sendMessage(id,thread,text,type=ThreadType.User,options={}){const r=instances.get(id);if(!r?.ready)throw new Error('Zalo chưa sẵn sàng. Hãy kết nối lại.');const result=await r.api.sendMessage({msg:text,...options},thread,type);return {id:String(result.message?.msgId||result.attachment?.[0]?.msgId||''),clientId:String(result.message?.cliMsgId||'')};}
export async function groupDetails(id,thread){
 const r=instances.get(id);if(!r?.ready)throw new Error('Zalo chưa sẵn sàng. Hãy kết nối lại.');
 const response=await r.api.getGroupInfo(thread),g=response.gridInfoMap?.[thread];if(!g)throw new Error('Zalo không trả thông tin nhóm.');
 const ids=[...new Set([...(g.memberIds||[]),...(g.memVerList||[]).map(v=>v.split('_')[0])])];const members=[];
 for(let i=0;i<ids.length;i+=100){const result=await r.api.getGroupMembersInfo(ids.slice(i,i+100));for(const [key,p] of Object.entries(result.profiles||{})){const uid=String(p.id||key.split('_')[0]);members.push({id:uid,name:p.displayName||p.zaloName||uid,avatar:p.avatar||'',role:uid===String(g.creatorId)?'owner':(g.adminIds||[]).map(String).includes(uid)?'admin':'member'});}}
 const ownId=String(r.api.getOwnId());return {name:g.name,description:g.desc||'',memberCount:g.totalMember||members.length,members,ownId,ownRole:ownId===String(g.creatorId)?'owner':(g.adminIds||[]).map(String).includes(ownId)?'admin':'member',syncedAt:now()};
}
export async function changeGroup(id,thread,action,input={}){
 const r=instances.get(id);if(!r?.ready)throw new Error('Zalo chưa sẵn sàng. Hãy kết nối lại.');
 const details=await groupDetails(id,thread);
 if(['rename','add','remove','disband'].includes(action)&&!['owner','admin'].includes(details.ownRole))throw new Error('Tài khoản Zalo chưa có quyền quản trị nhóm.');
 if(action==='disband'&&details.ownRole!=='owner')throw new Error('Chỉ trưởng nhóm Zalo có thể giải tán.');
 let result;
 if(action==='rename')result=await r.api.changeGroupName(input.name,thread);
 else if(action==='add')result=await r.api.addUserToGroup(input.memberIds,thread);
 else if(action==='remove'){if(input.memberIds.includes(details.ownId))throw new Error('Dùng chức năng Rời nhóm để rời khỏi nhóm.');result=await r.api.removeUserFromGroup(input.memberIds,thread);}
 else if(action==='leave')result=await r.api.leaveGroup(thread);
 else if(action==='disband')result=await r.api.disperseGroup(thread);
 else throw new Error('Thao tác nhóm không hợp lệ.');
 if(result?.errorMembers?.length||result?.memberError?.length)throw new Error('Zalo chỉ xử lý được một phần thành viên. Đồng bộ nhóm để kiểm tra kết quả trước khi thử lại.');
 return {ok:true};
}
export async function newGroup(id,name,members){
 const r=instances.get(id);if(!r?.ready)throw new Error('Zalo chưa sẵn sàng. Hãy kết nối lại.');
 const response=await r.api.createGroup({name,members});if(!response.groupId)throw new Error('Zalo không trả mã nhóm. Hãy kiểm tra trên Zalo trước khi tạo lại.');
 const c=conversation(id,String(response.groupId),ThreadType.Group,name);return put('conversations',{...c,title:name,group:{name,memberCount:(response.sucessMembers||[]).length+1,members:[]},groupWarning:response.errorMembers?.length?'Một số thành viên chưa được thêm. Hãy đồng bộ nhóm.':''});
}
export async function friendAction(id,thread,action,message=''){
 const r=instances.get(id);if(!r?.ready)throw new Error('Zalo chưa sẵn sàng. Hãy kết nối lại.');
 if(!thread)throw new Error('Hội thoại chưa có mã người dùng Zalo.');
 const result=await r.api.getUserInfo(thread),p=result.changed_profiles?.[thread]||result.unchanged_profiles?.[thread]||Object.values(result.changed_profiles||{}).find(p=>String(p.userId)===thread);
 if(!p||![0,1].includes(p.isFr))throw new Error('Zalo chưa trả trạng thái kết bạn. Hãy đồng bộ lại.');
 const isFriend=Number(p.isFr)===1;
 if(action==='sync')return {isFriend,...(isFriend?{friendRequestPending:false}:{})};
 if(action==='request'){
  if(isFriend)return {isFriend:true,friendRequestPending:false};
  await r.api.sendFriendRequest(message,thread);return {isFriend:false,friendRequestPending:true};
 }
 if(action==='remove'){if(isFriend)await r.api.removeFriend(thread);return {isFriend:false,friendRequestPending:false};}
 throw new Error('Thao tác kết bạn không hợp lệ.');
}
export async function disconnect(id){channel(id);const ticket=logins.get(id);logins.delete(id);ticket?.abort?.();const r=instances.get(id);instances.delete(id);r?.api.listener.stop();db.prepare('DELETE FROM secrets WHERE id=?').run(`zalo_session_${id}`);state(id,{status:'disconnected',listenerState:'stopped'});return {success:true,message:'Đã ngắt Zalo; giữ lại danh bạ và lịch sử đã tải.'};}

export async function openPhoneConversation(id,phone){const r=instances.get(id);if(!r?.ready)throw new Error('Zalo chưa sẵn sàng. Hãy kết nối lại.');const profile=await r.api.findUser(phone);if(!profile?.uid)throw new Error('Không tìm thấy tài khoản Zalo theo số điện thoại này hoặc người dùng hạn chế tìm kiếm.');return transaction(()=>{const c=conversation(id,String(profile.uid),ThreadType.User,profile.display_name||profile.zalo_name);const p=get('customers',c.customerId);put('customers',{...p,name:p.nameEditedLocally?p.name:(profile.display_name||profile.zalo_name||p.name),phone:p.phone||phone,zaloAvatar:profile.avatar||p.zaloAvatar,zaloUserId:String(profile.uid)});return c;});}

const groupNameJobs=new Map();
export function importGroupNames(id,response){const groups=response?.gridInfoMap||{};return transaction(()=>{let count=0;for(const [thread,g] of Object.entries(groups)){if(!g?.name)continue;const c=conversation(id,thread,ThreadType.Group,g.name),p=get('customers',c.customerId);put('conversations',{...c,title:c.localGroupName?c.title:g.name,group:{...c.group,name:g.name,avatar:g.avt||g.avatar||c.group?.avatar,memberCount:g.totalMember??c.group?.memberCount,nameSyncedAt:now()}});if(p&&!p.nameEditedLocally)put('customers',{...p,name:g.name});count++;}return count;});}
export async function syncGroupNames(id,api){if(typeof api.getAllGroups!=='function'||typeof api.getGroupInfo!=='function')return 0;const response=await api.getAllGroups(),ids=Object.keys(response.gridVerMap||{});let count=0;for(let i=0;i<ids.length;i+=50){const result=await api.getGroupInfo(ids.slice(i,i+50));count+=importGroupNames(id,result);}return count;}
function startGroupNames(id,api){if(groupNameJobs.has(id))return;const job=syncGroupNames(id,api).then(count=>state(id,{groupNamesSyncedAt:now(),groupNamesCount:count,groupNamesError:''})).catch(()=>state(id,{groupNamesError:'Chưa tải được tên nhóm. Bấm Đồng bộ để thử lại.'})).finally(()=>groupNameJobs.delete(id));groupNameJobs.set(id,job);}
