import http from 'node:http';
import { readFileSync,createReadStream,createWriteStream,existsSync,statSync,unlinkSync,readdirSync } from 'node:fs';
import { join,resolve,extname,basename,sep } from 'node:path';
import { randomBytes,scryptSync,timingSafeEqual,createHash,createHmac } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { backup } from 'node:sqlite';
import { db,dataDir,all,get,put,transaction,now,uid,audit,secret,saveSecret,notification } from './store.mjs';
import { seed } from './seed.mjs';
import * as domain from './domain.mjs';
import {planRoute,syncPlanHandoff} from './plan-bridge.mjs';
import * as care from './taophacdo.mjs';
import {supabaseRoute,integrationState} from './supabase.mjs';
care.migrateLocal();
import { providers,testConnection,aiDraft,ghn } from './connectors.mjs';

const port=Number(process.env.PORT||4317);const host=process.env.HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');const publicDir=resolve('public');
const hashPassword=(p,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(p,salt,64).toString('hex')}`;
const verify=(p,hash)=>{const [salt,h]=hash.split(':');return timingSafeEqual(Buffer.from(hashPassword(p,salt).split(':')[1],'hex'),Buffer.from(h,'hex'));};
const sha=s=>createHash('sha256').update(s).digest('hex');
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req,limit=2e6){let n=0;const chunks=[];for await(const b of req){n+=b.length;if(n>limit)domain.fail('Dữ liệu quá lớn.',413);chunks.push(b);}const raw=Buffer.concat(chunks);try{return {raw,value:raw.length?JSON.parse(raw):{}};}catch{domain.fail('JSON không hợp lệ.');}}
function userFor(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hub_session='))?.slice(12);if(!token)return null;const s=db.prepare('SELECT u.id,u.email,u.name,u.role,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1').get(sha(token),Date.now());return s||null;}
function login(res,user){const token=randomBytes(32).toString('hex');const csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(token),user.id,csrf,Date.now()+7*86400000);res.setHeader('Set-Cookie',`hub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);return {...user,csrf,password:undefined};}
const throttles=new Map();const busy=new Set();
function checkOrigin(req){if(req.headers['sec-fetch-site']==='cross-site')domain.fail('Yêu cầu khác nguồn bị chặn.',403);if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)domain.fail('Nguồn yêu cầu không hợp lệ.',403);}}
const generic=/^\/api\/records\/([a-z]+)(?:\/([^/]+))?$/;
async function dispatch(req,res,url,user,input){const path=url.pathname;const method=req.method;
 const planResult=await planRoute(path,method,input,user,url);if(planResult!==undefined)return planResult;
 const integrated=await supabaseRoute(path,method,input,user);if(integrated!==undefined)return integrated;
 const careResult=await care.careRoute(path,method,input,user);if(careResult!==undefined)return careResult;
 // Enforce team/customer scope on object routes, including writes by guessed IDs.
 const object=path.match(/^\/api\/(conversations|contents|publications|orders|shipments|customers)\/([^/]+)/);
 if(object){const r=get(object[1],object[2]);if(r){if(r.connectionId)care.assertChannel(user,r.connectionId);if(r.customerId)care.assertCustomer(user,r.customerId);if(object[1]==='customers')care.assertCustomer(user,r.id);if(r.channels)for(const id of r.channels)care.assertChannel(user,id);if(r.orderId){const o=get('orders',r.orderId);if(o)care.assertCustomer(user,o.customerId);}}}
 if(input.customerId)care.assertCustomer(user,input.customerId);
 if(input.conversationId){const c=get('conversations',input.conversationId);if(c)care.assertChannel(user,c.connectionId);}
 if(input.channels)for(const id of input.channels)care.assertChannel(user,id);
 if(input.source&&path==='/api/customers/merge'){care.assertCustomer(user,input.source);care.assertCustomer(user,input.target);}
 const genericObject=path.match(/^\/api\/records\/(customers|contents)\/([^/]+)$/);if(genericObject){const r=get(genericObject[1],genericObject[2]);if(r){if(genericObject[1]==='customers')care.assertCustomer(user,r.id);else for(const id of r.channels||[])care.assertChannel(user,id);}}

 if(path==='/api/state'&&method==='GET'){
  const state={user,providers};for(const k of [...domain.kinds,...care.extraKinds]){if(['settings'].includes(k))continue;state[k]=all(k);}
  state.settings=get('settings','general')||{id:'general',name:'Mộc Workspace',timezone:'Asia/Ho_Chi_Minh'};
  if(user.role!=='owner')state.connections=state.connections.map(({accountId,apiVersion,...c})=>c);
  state.integrations={ai:!!secret('ai').token,aiModel:secret('ai').model||'',ghn:!!secret('shipping').token};
  state.users=db.prepare('SELECT id,name,email,role,active FROM users').all();state.careSettings=get('settings','care')||{slaMinutes:3};state.taophacdo=user.role==='owner'?integrationState(user):null;return care.scopeState(state,user);
 }
 if(path==='/api/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE user_id=? AND csrf=?').run(user.id,user.csrf);res.setHeader('Set-Cookie','hub_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');return {ok:true};}
 if(path==='/api/users'&&method==='POST'){if(user.role!=='owner')domain.fail('Cần quyền chủ hệ thống.',403);const email=domain.required(input.email,'Email',200).toLowerCase();if(!['manager','editor','support','warehouse','viewer'].includes(input.role))domain.fail('Vai trò không hợp lệ.');if((input.password||'').length<10)domain.fail('Mật khẩu cần ít nhất 10 ký tự.');try{const id=uid('user');db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(id,email,domain.required(input.name,'Tên',150),input.role,hashPassword(input.password));audit(user.id,'user_created',id);return {id};}catch(e){if(e.code?.startsWith('ERR_SQLITE'))domain.fail('Email đã tồn tại.');throw e;}}
 if(path.match(/^\/api\/users\/[^/]+$/)&&method==='PATCH'){if(user.role!=='owner')domain.fail('Cần quyền chủ hệ thống.',403);const id=path.split('/').pop();if(id===user.id)domain.fail('Không thể khóa tài khoản đang sử dụng.');db.prepare('UPDATE users SET active=? WHERE id=? AND role!=?').run(input.active?1:0,id,'owner');db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return {ok:true};}
 if(path==='/api/password'&&method==='POST'){const u=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);if(!verify(input.current||'',u.password))domain.fail('Mật khẩu hiện tại không đúng.');if((input.password||'').length<10)domain.fail('Mật khẩu mới cần ít nhất 10 ký tự.');db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(input.password),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);return {ok:true};}
 const match=path.match(generic);if(match){const [,kind,id]=match;if(method==='POST'&&!id)return domain.editRecord(user,kind,null,input);if(method==='PATCH'&&id)return domain.editRecord(user,kind,id,input);if(method==='DELETE'&&id)return domain.deleteRecord(user,kind,id);}
 if(path.match(/^\/api\/contents\/[^/]+\/schedule$/)&&method==='POST')return domain.schedule(user,path.split('/')[3],input);
 if(path.match(/^\/api\/publications\/[^/]+\/action$/)&&method==='POST')return domain.publicationAction(user,path.split('/')[3],input);
 if(path==='/api/orders'&&method==='POST')return domain.createOrder(user,input);
 if(path.match(/^\/api\/orders\/[^/]+\/action$/)&&method==='POST')return domain.orderAction(user,path.split('/')[3],input);
 if(path.match(/^\/api\/orders\/[^/]+\/shipments$/)&&method==='POST')return domain.createShipment(user,path.split('/')[3],input);
 if(path.match(/^\/api\/shipments\/[^/]+\/action$/)&&method==='POST')return domain.shipmentAction(user,path.split('/')[3],input);
 if(path==='/api/shipping/quote'&&method==='POST'){domain.permission(user,'shipping');const o=get('orders',input.orderId);if(!o)domain.fail('Không tìm thấy đơn.');return ghn('v2/shipping-order/fee',{service_type_id:2,to_district_id:domain.number(input.toDistrict,'Mã quận/huyện',1),to_ward_code:domain.required(input.toWard,'Mã phường/xã',100),weight:o.items.reduce((s,i)=>s+(get('products',i.productId).weight||500)*i.quantity,0),insurance_value:o.subtotal,length:20,width:15,height:10});}
 if(path.match(/^\/api\/conversations\/[^/]+\/messages$/)&&method==='POST')return domain.reply(user,path.split('/')[3],input);
 if(path==='/api/conversations/demo'&&method==='POST')return domain.ingestDemo(user,input);
 if(path.match(/^\/api\/conversations\/[^/]+$/)&&method==='PATCH'){domain.permission(user,'inbox');const c=get('conversations',path.split('/')[3]);if(!c)domain.fail('Không tìm thấy.',404);if(input.status&&!['open','pending','resolved'].includes(input.status))domain.fail('Trạng thái không hợp lệ.');const p={...c};for(const key of ['status','assignee','unread','tags'])if(input[key]!==undefined)p[key]=input[key];return put('conversations',p,input.version);}
 if(path.match(/^\/api\/connections\/[^/]+\/test$/)&&method==='POST'){if(user.role!=='owner')domain.fail('Cần quyền chủ hệ thống.',403);const c=get('connections',path.split('/')[3]);if(!c)domain.fail('Không tìm thấy kênh.',404);if(c.mode!=='api')domain.fail('Kênh này không ở chế độ API.');const r=await testConnection(c);put('connections',{...c,status:'connected',verifiedAt:now(),remoteName:r.name||r.username||r.data?.name||c.name});return {ok:true,message:'Token đọc được thông tin tài khoản. Quyền xuất bản/nhắn tin vẫn được API kiểm tra ở từng thao tác.'};}
 if(path==='/api/integrations'&&method==='POST'){if(user.role!=='owner')domain.fail('Cần quyền chủ hệ thống.',403);if(!['ai','shipping'].includes(input.type))domain.fail('Loại tích hợp không hợp lệ.');const old=secret(input.type);saveSecret(input.type,{...old,...(input.token?{token:input.token}:{}),...(input.model?{model:input.model}:{}),...(input.shopId?{shopId:input.shopId}:{})});audit(user.id,'integration_configured',input.type);return {ok:true};}
 if(path==='/api/ai/draft'&&method==='POST'){
  domain.permission(user,input.kind==='content'?'content':'inbox');const usage=all('tasks').filter(x=>x.type==='ai_usage'&&x.createdAt.slice(0,10)===now().slice(0,10));if(usage.length>=50)domain.fail('Đã đạt giới hạn 50 yêu cầu AI/ngày của bản localhost.');
  let context='';if(input.conversationId){const c=get('conversations',input.conversationId);if(!c)domain.fail('Không tìm thấy hội thoại.');const p=c.productId?get('products',c.productId):null;context=JSON.stringify({messages:all('messages').filter(m=>m.conversationId===c.id).slice(0,12).map(m=>({text:m.text,direction:m.direction})),product:p?{name:p.name,price:p.price,available:p.stock-p.reserved,description:p.description}:null});}
  const prompt=`Nhiệm vụ: ${domain.required(input.prompt,'Yêu cầu',5000)}\nNgữ cảnh: ${context}\nNguồn tri thức nội bộ: ${all('knowledge').map(k=>k.title+'\n'+k.body).join('\n').slice(0,18000)}`;put('tasks',{type:'ai_usage',name:'Yêu cầu AI',status:'done',actor:user.id});return {text:await aiDraft(prompt)};
 }
 if(path==='/api/customers/merge'&&method==='POST'){domain.permission(user,'customers');if(input.source===input.target)domain.fail('Chọn hai khách khác nhau.');return transaction(()=>{const s=get('customers',input.source),t=get('customers',input.target);if(!s||!t)domain.fail('Không tìm thấy khách.');if(s.origin==='taophacdo'||t.origin==='taophacdo')domain.fail('Hồ sơ taophacdo phải gộp tại hệ thống gốc để giữ liên kết phác đồ và thiết bị.');if(s.mergedInto||t.mergedInto)domain.fail('Khách đã được gộp.');for(const k of ['conversations','orders','leads','identities','enrollments','journey_events'])for(const r of all(k).filter(x=>x.customerId===s.id))put(k,{...r,customerId:t.id});put('customers',{...s,mergedInto:t.id});audit(user.id,'customer_merged',t.id,{source:s,target:t});return put('customers',{...t,tags:[...new Set([...(t.tags||[]),...(s.tags||[])])]});});}
 if(path==='/api/workflows/test'&&method==='POST'){if(user.role!=='owner')domain.fail('Cần quyền chủ hệ thống.',403);const w=get('workflows',input.id);if(!w)domain.fail('Không tìm thấy quy tắc.');return {matched:!w.keyword||String(input.text||'').toLowerCase().includes(w.keyword.toLowerCase()),action:w.action,value:w.value,executed:false};}
 if(path==='/api/notifications/read'&&method==='POST'){for(const n of all('notifications'))put('notifications',{...n,read:true});return {ok:true};}
 if(path==='/api/audit'&&method==='GET'){if(!['owner','manager'].includes(user.role))domain.fail('Cần quyền quản lý.',403);return db.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 300').all();}
 if(path==='/api/backup'&&method==='POST'){if(user.role!=='owner')domain.fail('Cần quyền chủ hệ thống.',403);const name=`hub-${now().replace(/[:.]/g,'-')}.sqlite`;await backup(db,join(dataDir,'backups',name));audit(user.id,'backup',name);return {name,note:'Bản sao database trong data/backups. Để khôi phục đầy đủ, giữ cả uploads và encryption.key.'};}
 if(path==='/api/export'&&method==='GET'){if(user.role!=='owner')domain.fail('Cần quyền chủ hệ thống.',403);const data={exportedAt:now(),version:1};for(const k of [...domain.kinds,...care.extraKinds])data[k]=all(k);res.setHeader('Content-Disposition','attachment; filename="moc-export.json"');audit(user.id,'export');return data;}
 if(path==='/api/import/customers'&&method==='POST'){domain.permission(user,'customers');if(!Array.isArray(input.rows)||input.rows.length>1000)domain.fail('Tối đa 1.000 khách/lần.');const result=[];for(const row of input.rows){try{if(row.phone&&all('customers').some(c=>c.phone===row.phone))throw new Error('Số điện thoại đã tồn tại.');result.push({ok:true,id:domain.editRecord(user,'customers',null,{...row,consent:false}).id});}catch(e){result.push({ok:false,error:e.message});}}return result;}
 domain.fail('Không tìm thấy API.',404);
}

async function webhook(req,res,url){const id=url.pathname.split('/').pop();const c=get('connections',id);if(!c||c.provider!=='facebook')domain.fail('Webhook không tồn tại.',404);const sec=secret(id);
 if(req.method==='GET'){if(sec.verifyToken&&url.searchParams.get('hub.verify_token')===sec.verifyToken){res.writeHead(200,{'Content-Type':'text/plain'});res.end(url.searchParams.get('hub.challenge')||'');return;}domain.fail('Verify token không hợp lệ.',403);}
 const {raw,value}=await body(req);const signature=req.headers['x-hub-signature-256']||'';if(!sec.appSecret)domain.fail('Chưa có App Secret.',403);const expected='sha256='+createHmac('sha256',sec.appSecret).update(raw).digest('hex');if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))domain.fail('Chữ ký không hợp lệ.',403);
 transaction(()=>{for(const entry of value.entry||[])for(const event of entry.messaging||[]){if(!event.message?.text||event.message.is_echo||String(event.recipient?.id)!==String(c.accountId))continue;const eventId=event.message.mid;if(!eventId||db.prepare('SELECT id FROM events WHERE id=?').get(id+eventId))continue;
  db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(id+eventId,id,now(),JSON.stringify(event));let conv=all('conversations').find(x=>x.connectionId===id&&x.kind==='message'&&x.externalUserId===event.sender.id);if(!conv){const customer=put('customers',{name:'Khách Facebook '+String(event.sender.id).slice(-6),phone:'',tags:[],consent:false});conv=put('conversations',{customerId:customer.id,connectionId:id,externalUserId:event.sender.id,kind:'message',status:'open',tags:[],mode:'api'});}
  const msg=put('messages',{conversationId:conv.id,direction:'incoming',text:event.message.text,externalId:eventId,status:'received'});put('conversations',{...conv,unread:true,status:'open',lastMessage:event.message.text,lastAt:now(),lastInboundAt:new Date(event.timestamp||Date.now()).toISOString()});domain.runWorkflows('message_received',msg);care.captureLead(get('conversations',conv.id),msg);
 }care.ingestComments(c,value.entry);});json(res,{ok:true});
}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
 const url=new URL(req.url,'http://localhost');const path=url.pathname;if(path.startsWith('/plan-ui/')){res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");}const user=userFor(req);
 if(path==='/api/health')return json(res,{ok:true,service:'Moc Hub'});
 if(path.startsWith('/api/webhooks/'))return await webhook(req,res,url);
 if(path==='/api/events'&&req.method==='GET'){if(!user)domain.fail('Vui lòng đăng nhập.',401);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});let revision=db.prepare('SELECT sum(version) AS n FROM records').get().n;res.write('event: ready\ndata: {}\n\n');const timer=setInterval(()=>{if(!userFor(req)){clearInterval(timer);res.end();return;}const next=db.prepare('SELECT sum(version) AS n FROM records').get().n;if(next!==revision){revision=next;res.write('event: changed\ndata: {}\n\n');}else res.write(': keepalive\n\n');},2000);req.on('close',()=>clearInterval(timer));return;}
 if(path==='/api/bootstrap'){const setup=!db.prepare('SELECT id FROM users LIMIT 1').get();return json(res,{setup,user});}
 if(path==='/api/setup'&&req.method==='POST'){
  checkOrigin(req);if(db.prepare('SELECT id FROM users LIMIT 1').get())domain.fail('Hệ thống đã được thiết lập.',409);const {value:b}=await body(req);
  if((b.password||'').length<10)domain.fail('Mật khẩu cần ít nhất 10 ký tự.');const email=domain.required(b.email,'Email',200).toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))domain.fail('Email không hợp lệ.');const u={id:uid('user'),email,name:domain.required(b.name,'Tên',150),role:'owner'};
  transaction(()=>{if(db.prepare('SELECT id FROM users LIMIT 1').get())domain.fail('Hệ thống đã được thiết lập.',409);db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(u.id,u.email,u.name,u.role,hashPassword(b.password));put('settings',{id:'general',name:b.workspace||'Mộc Workspace',timezone:'Asia/Ho_Chi_Minh'});if(b.demo===true)seed();});return json(res,login(res,u));
 }
 if(path==='/api/login'&&req.method==='POST'){
  checkOrigin(req);const ip=req.socket.remoteAddress;const record=throttles.get(ip)||{count:0,until:Date.now()+60000};if(Date.now()>record.until){record.count=0;record.until=Date.now()+60000;}record.count++;throttles.set(ip,record);if(record.count>12)domain.fail('Quá nhiều lần thử. Vui lòng chờ một phút.',429);
  const {value:b}=await body(req);const u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(b.email||'').toLowerCase());if(!u||!verify(String(b.password||''),u.password))domain.fail('Email hoặc mật khẩu không đúng.',401);return json(res,login(res,u));
 }
 if(path.startsWith('/api/')||path.startsWith('/uploads/')){
  if(!user)domain.fail('Vui lòng đăng nhập.',401);
  if(req.method!=='GET'&&req.method!=='HEAD'){checkOrigin(req);if(req.headers['x-csrf-token']!==user.csrf)domain.fail('Phiên làm việc không hợp lệ. Tải lại trang.',403);}
  if(path==='/api/upload'&&req.method==='POST'){
   domain.permission(user,'assets');const name=decodeURIComponent(req.headers['x-filename']||'media');const mime=String(req.headers['content-type']||'');const types={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov'};if(!types[mime])domain.fail('Hỗ trợ JPG, PNG, WebP, MP4, WebM, MOV.');
   const id=uid('asset');const filename=id+types[mime];const target=join(dataDir,'uploads',filename);let size=0;const sniff=[];
   const limiter=new Transform({transform(chunk,enc,cb){size+=chunk.length;if(size>500*1024*1024)return cb(Object.assign(new Error('File vượt 500 MB.'),{status:413}));if(sniff.reduce((s,b)=>s+b.length,0)<32)sniff.push(chunk.subarray(0,32));cb(null,chunk);}});
   try{await pipeline(req,limiter,createWriteStream(target,{flags:'wx'}));const b=Buffer.concat(sniff);const valid=mime==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?b[0]===255&&b[1]===216:mime==='image/webp'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP':mime==='video/webm'?b.subarray(0,4).equals(Buffer.from([26,69,223,163])):b.toString('ascii',4,8)==='ftyp';if(!valid)domain.fail('Nội dung file không khớp loại media.');const asset=put('assets',{id,name:basename(name).slice(0,200),mime,size,url:'/uploads/'+filename,type:mime.startsWith('video')?'video':'image'});return json(res,asset,201);}catch(e){if(existsSync(target))unlinkSync(target);throw e;}
  }
  if(path.startsWith('/uploads/'))return serveFile(req,res,join(dataDir,'uploads',basename(path)),true);
  let input={};if(!['GET','HEAD'].includes(req.method))input=(await body(req)).value;
  let key=null;const supplied=req.headers['idempotency-key'];const mutating=req.method==='POST'&&!['/api/ai/draft','/api/backup'].includes(path);
  if(mutating&&supplied){key=user.id+':'+path+':'+String(supplied).slice(0,150);const hash=sha(JSON.stringify(input));const prior=db.prepare('SELECT * FROM idempotency WHERE key=?').get(key);if(prior){if(prior.hash!==hash)domain.fail('Khóa thao tác đã dùng với dữ liệu khác.',409);return json(res,JSON.parse(prior.result));}if(busy.has(key))domain.fail('Thao tác đang xử lý, vui lòng chờ.',409);busy.add(key);}
  try{const result=await dispatch(req,res,url,user,input);if(key)db.prepare('INSERT INTO idempotency VALUES(?,?,?,?)').run(key,sha(JSON.stringify(input)),JSON.stringify(result),now());return json(res,result);}finally{if(key)busy.delete(key);}
 }
 if(!['GET','HEAD'].includes(req.method))domain.fail('Không hỗ trợ.',405);
 const file=path==='/'?join(publicDir,'index.html'):resolve(publicDir,'.'+decodeURIComponent(path));if(!file.startsWith(publicDir+sep))domain.fail('Không được phép.',403);
 return serveFile(req,res,file,false);
}catch(e){if(!res.headersSent)json(res,{error:e.message||'Lỗi hệ thống.'},e.status||500);else res.end();}});
function serveFile(req,res,file,privateFile){if(!existsSync(file)||!statSync(file).isFile())return json(res,{error:'Không tìm thấy file.'},404);const st=statSync(file);const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'}[extname(file)]||'application/octet-stream';res.setHeader('Content-Type',mime);res.setHeader('Cache-Control',privateFile?'private, no-store':'no-cache');res.setHeader('Accept-Ranges','bytes');const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),st.size-1):st.size-1;if(start>end||start>=st.size){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});return res.end();}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':end-start+1});return createReadStream(file,{start,end}).pipe(res);}res.setHeader('Content-Length',st.size);if(req.method==='HEAD')return res.end();createReadStream(file).pipe(res);}
domain.recoverJobs();for(const o of all('orders'))syncPlanHandoff(o);for(const r of all('template_runs').filter(r=>['sending','pending'].includes(r.status)))put('template_runs',{...r,status:r.status==='sending'?'unknown':'failed',error:'Máy chủ đã khởi động lại; kiểm tra trước khi tiếp tục.'});
setInterval(()=>{try{care.serviceTick();}catch(e){console.error('Care worker:',e.message);}},15000).unref();setInterval(()=>domain.tick().catch(e=>console.error('Scheduler:',e.message)),5000).unref();
setInterval(()=>db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()),3600000).unref();
server.listen(port,host,()=>console.log(`Mộc Hub: http://${host==='0.0.0.0'?'localhost':host}:${port}\nDatabase: ${join(dataDir,'hub.sqlite')}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
