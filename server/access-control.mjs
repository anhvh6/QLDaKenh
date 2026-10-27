import {get,put,db,transaction,audit,uid} from './store.mjs';
import {accessCatalog,accessMenus,accessSettings,planPermissions,notificationPermissions,effectiveAccess} from '../public/access-model.js';
import {randomBytes,scryptSync} from 'node:crypto';
const fail=(message,status=403)=>{throw Object.assign(Error(message),{status});};
export const accessId='unified-access-v1';
export const legacyActions={owner:['*'],manager:['*'],editor:['read','content','assets','campaigns'],support:['read','assets','inbox','customers','orders','tasks'],warehouse:['read','shipping','products'],viewer:['read']};
const names={owner:'Chủ hệ thống',manager:'Quản lý',editor:'Biên tập viên',support:'Chăm sóc khách hàng',warehouse:'Kho vận',viewer:'Chỉ xem'};
const actionMenu={content:'content',campaigns:'campaigns',inbox:'inbox',products:'products',orders:'orders',customers:'settings',admin:'settings',assets:null,shipping:null,tasks:null,read:null};
const hash=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex');};
export function defaultAccess(){return {id:accessId,roles:Object.entries(names).map(([id,name])=>({id,name,permissions:Object.fromEntries(accessCatalog.map(p=>{const action=Object.entries(actionMenu).find(([,menu])=>'menu.'+menu===p.id)?.[0];return [p.id,id==='owner'||id==='manager'||p.id.startsWith('menu.')||p.id.startsWith('notify.')?(id==='owner'||id==='manager'||p.id.startsWith('notify.')||!action||legacyActions[id].includes(action)):false];}))})),users:{},catalog:accessCatalog,imported:false};}
export function accessConfig(){const cfg=get('settings',accessId)||defaultAccess();for(const p of notificationPermissions)if(!cfg.catalog.some(c=>c.id===p.id)&&!cfg.deletedPermissions?.includes(p.id)){cfg.catalog.push(p);for(const role of cfg.roles)role.permissions[p.id]=true;}return cfg;}
export function accessFor(user,config=accessConfig()){
 if(user.role==='owner')return {...Object.fromEntries(config.catalog.map(p=>[p.id,p.id.startsWith('notify.')?(Object.hasOwn(config.users[user.id]?.overrides||{},p.id)?config.users[user.id].overrides[p.id]:config.roles.find(r=>r.id==='owner')?.permissions[p.id]!==false):true])),...Object.fromEntries((config.deletedPermissions||[]).map(key=>[key,true]))};
 const role=config.roles.find(r=>r.id===user.role)||{permissions:{}};return {...effectiveAccess(role,config.users[user.id]?.overrides,config.catalog),...Object.fromEntries((config.deletedPermissions||[]).map(key=>[key,true]))};
}
export const withAccess=user=>user?{...user,roleLabel:accessConfig().roles.find(r=>r.id===user.role)?.name||user.role,access:accessFor(user)}:null;
export function hasAccess(user,key,cfg){return !!user&&(user.role==='owner'&&!key.startsWith('notify.')||accessFor(user,cfg)[key]===true);}
export function assertAccess(user,key){if(!hasAccess(user,key))fail('Bạn không có quyền truy cập chức năng này.');}
export function hasAction(user,action){if(user.role==='owner')return true;const cfg=get('settings',accessId);if(!cfg)return (legacyActions[user.role]||[]).some(v=>v==='*'||v===action);if(action==='read')return true;if(action==='inbox')return hasAccess(user,'menu.inbox',cfg)||hasAccess(user,'menu.comments',cfg);if(action==='customers')return hasAccess(user,'settings.customers',cfg)||hasAccess(user,'menu.orders',cfg)||hasAccess(user,'menu.inbox',cfg)||hasAccess(user,'plan.view_students',cfg);const menu=actionMenu[action];return menu?hasAccess(user,'menu.'+menu,cfg):true;}
export function assertManageAccess(user){assertAccess(user,'menu.settings');assertAccess(user,'settings.access');}
export function accessSnapshot(user){assertManageAccess(user);const cfg=accessConfig();return {...cfg,users:db.prepare('SELECT id,name,email,role,active FROM users').all().filter(u=>!cfg.users[u.id]?.deletedAt).map(u=>({...u,...cfg.users[u.id],overrides:cfg.users[u.id]?.overrides||{},effective:accessFor(u,cfg)})),canManage:true};}
export function importLegacyAccess({roles=[],permissions=[],mappings=[],users=[]}={}){
 return transaction(()=>{const old=accessConfig();if(old.imported)return old;const cfg=structuredClone(old);for(const p of [...permissions,...mappings.map(m=>({code:m.permission_code}))]){const id='plan.'+p.code;if(!cfg.catalog.some(c=>c.id===id))cfg.catalog.push({id,label:p.display_name||p.code,group:'Bảng quản trị phác đồ'});}
 for(const r of [...roles,...users.map(u=>({name:u.role})),...mappings.map(m=>({name:m.role_name}))]){if(!r.name||cfg.roles.some(v=>v.id===r.name))continue;cfg.roles.push({id:r.name,name:r.display_name||r.name,permissions:Object.fromEntries(cfg.catalog.map(p=>[p.id,p.id.startsWith('menu.')?p.id==='menu.phacdo':p.id.startsWith('plan.')&&(r.name==='super_admin'||mappings.some(m=>m.role_name===r.name&&'plan.'+m.permission_code===p.id))]))});}
 for(const u of users){if(!u.email||!cfg.roles.some(r=>r.id===u.role))continue;let local=db.prepare('SELECT id FROM users WHERE lower(email)=?').get(u.email.toLowerCase());if(!local){local={id:uid('user')};db.prepare('INSERT INTO users(id,email,name,role,password,active) VALUES(?,?,?,?,?,0)').run(local.id,u.email.toLowerCase(),u.name||u.email.split('@')[0],u.role,hash(randomBytes(32).toString('hex')));cfg.users[local.id]={needsPassword:true};}cfg.users[local.id]={...cfg.users[local.id],planUserId:u.id};}
 cfg.imported=true;return put('settings',cfg,old.version);});
}
function validatePatch(user,permissions,cfg){if(!permissions||typeof permissions!=='object'||Array.isArray(permissions))fail('Quyền không hợp lệ.',400);for(const [key,value]of Object.entries(permissions)){if(!cfg.catalog.some(p=>p.id===key)||typeof value!=='boolean')fail('Quyền không hợp lệ.',400);if(value&&!key.startsWith('notify.')&&!hasAccess(user,key))fail('Không thể cấp quyền mà bạn không có.');}return permissions;}
function version(cfg,input){if(cfg.version!==input.version)fail('Bảng quyền đã thay đổi. Tải lại trước khi lưu.',409);}
function target(cfg,id){const row=db.prepare('SELECT id,name,email,role,active FROM users WHERE id=?').get(id);if(!row||cfg.users[id]?.deletedAt)fail('Không tìm thấy tài khoản.',404);return row;}
export function mutateAccess(user,kind,id,input){assertManageAccess(user);return transaction(()=>{
 const cfg=structuredClone(accessConfig());version(cfg,input);
 if(kind==='permission-label'||kind==='permission-delete'){
 const permission=cfg.catalog.find(p=>p.id===id);if(!permission)fail('Không tìm thấy quyền.',404);if(user.role!=='owner'&&!id.startsWith('notify.')&&!hasAccess(user,id))fail('Không thể sửa quyền mà bạn không có.');if(kind==='permission-label'){const label=String(input.name||'').trim();if(!label||label.length>150)fail('Tên quyền không hợp lệ.',400);permission.label=label;}else{cfg.catalog=cfg.catalog.filter(p=>p.id!==id);cfg.deletedPermissions=[...new Set([...(cfg.deletedPermissions||[]),id])];for(const r of cfg.roles)delete r.permissions[id];for(const u of Object.values(cfg.users))if(u.overrides)delete u.overrides[id];}
 }else if(kind==='role-delete'){
 if(id==='owner'||user.role!=='owner'&&id===user.role)fail('Không thể xóa vai trò này.');if(!cfg.roles.some(r=>r.id===id))fail('Không tìm thấy vai trò.',404);if(db.prepare('SELECT id FROM users WHERE role=?').all(id).some(u=>!cfg.users[u.id]?.deletedAt))fail('Vai trò vẫn còn tài khoản; không thể xóa.',409);cfg.roles=cfg.roles.filter(r=>r.id!==id);
 }else if(kind==='roles'){
  const role=id?cfg.roles.find(r=>r.id===id):null;if(id&&!role)fail('Không tìm thấy vai trò.',404);if(id==='owner'||user.role!=='owner'&&id===user.role)fail('Không thể sửa vai trò quản trị đang bảo vệ.');
  const name=String(input.name||'').trim();if(!name||name.length>100)fail('Tên vai trò không hợp lệ.',400);
  const permissions=validatePatch(user,input.permissions||role?.permissions||{},cfg);if(!id){id=uid('role');cfg.roles.push({id,name,permissions});}else Object.assign(role,{name,permissions});
 }else{
  const old=id?target(cfg,id):null;if(old?.role==='owner'&&user.role!=='owner')fail('Chỉ chủ hệ thống được sửa tài khoản chủ hệ thống.');
  if(kind==='delete'||kind==='lock'){
   if(old.id===user.id||old.role==='owner')fail('Không thể khóa hoặc xóa tài khoản này.');
   if(kind==='delete'){cfg.users[id]={...cfg.users[id],deletedAt:new Date().toISOString()};db.prepare('UPDATE users SET active=0 WHERE id=?').run(id);}else{if(cfg.users[id]?.needsPassword&&input.active)fail('Cần đặt mật khẩu trước khi mở khóa.',400);db.prepare('UPDATE users SET active=? WHERE id=?').run(input.active?1:0,id);}
  }else if(kind==='permissions'){
   if(old.role==='owner'||old.id===user.id){const keys=new Set([...Object.keys(input.overrides||{}),...Object.keys(cfg.users[id]?.overrides||{})]);if([...keys].some(k=>!k.startsWith('notify.')&&input.overrides?.[k]!==cfg.users[id]?.overrides?.[k]))fail('Không thể tự thay đổi quyền của tài khoản này.');}cfg.users[id]={...cfg.users[id],overrides:validatePatch(user,input.overrides,cfg)};
  }else{
   const name=String(input.name||'').trim(),email=String(input.email||'').trim().toLowerCase(),role=String(input.role||'');if(!name||name.length>150||!/^\S+@\S+\.\S+$/.test(email))fail('Tên hoặc email không hợp lệ.',400);
   const r=cfg.roles.find(r=>r.id===role);if(!r||role==='owner'&&old?.role!=='owner'||old?.role==='owner'&&role!=='owner')fail('Vai trò không hợp lệ.',400);
   if(old?.id===user.id&&role!==old.role)fail('Không thể tự đổi vai trò.');if(role!==old?.role&&user.role!=='owner')validatePatch(user,r.permissions,cfg);
   const password=String(input.password||'');if((!old||password)&&password.length<10)fail('Mật khẩu cần ít nhất 10 ký tự.',400);
   if(db.prepare('SELECT id FROM users WHERE lower(email)=? AND id!=?').get(email,id||''))fail('Email đã tồn tại.',409);
   if(!old){id=uid('user');db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(id,email,name,role,hash(password));}
   else{db.prepare('UPDATE users SET name=?,email=?,role=? WHERE id=?').run(name,email,role,id);if(password){db.prepare('UPDATE users SET password=?,active=1 WHERE id=?').run(hash(password),id);cfg.users[id]={...cfg.users[id],needsPassword:false};}}
  }
  // Revocation is immediate: the next authenticated request must use current rights.
  if(kind==='delete'||kind==='lock'||input.password||input.email&&input.email!==old?.email){if(id===user.id)db.prepare('DELETE FROM sessions WHERE user_id=? AND csrf!=?').run(id,user.csrf||'');else db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);}
 }
 put('settings',cfg,cfg.version);audit(user.id,'access_'+kind,id);return {ok:true,id};
 });}
