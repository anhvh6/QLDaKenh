import {assertAccess,hasAccess} from './access-control.mjs';
import {get} from './store.mjs';
const deny=()=>{throw Object.assign(Error('Bạn không có quyền thực hiện thao tác này.'),{status:403});};
export function guardAccessRequest(user,path,method,url,input={}){
 if(user.role==='owner')return;
 const require=key=>assertAccess(user,key),write=!['GET','HEAD'].includes(method);
 const conversationPath=path.match(/^\/api\/(?:chat\/|care\/|chatbot\/)?conversations\/([^/]+)/),messagePath=path.match(/^\/api\/(?:chat\/)?messages\/([^/]+)/),message=messagePath&&get('messages',messagePath[1]),conversation=get('conversations',conversationPath?.[1]||message?.conversationId||input.conversationId||'');
 if(conversation)require(conversation.kind==='comment'?'menu.comments':'menu.inbox');
 if(path.startsWith('/api/proxy/supabase/')){
  require('menu.phacdo');const part=path.slice('/api/proxy/supabase/'.length);
  if(/^(auth|functions)\//.test(part))return deny();
  const table=part.replace(/^rest\/v1\//,'');
  if(['roles','permissions','role_permissions','admin_users'].includes(table))return deny();
  if(table==='customers'){
   if(!write)require('plan.view_students');else if(method==='DELETE')require('plan.delete_student');else if(!['add_student','edit_student','edit_email','approve_email','delete_student','restore_student'].some(p=>hasAccess(user,'plan.'+p)))deny();return;
  }
  const tables={customer_devices:write?(method==='DELETE'?'delete_device':'approve_device'):'view_devices',customer_tasks:write?'edit_plan':'view_plan',master_video_tasks:write?'save_template':'view_plan',master_tasks:write?'save_template':'view_plan',plan_templates:write?'save_template':'view_plan',templates:write?'save_template':'view_plan',products:write?'manage_products':'view_products',attendance_logs:'view_reports',access_logs:'view_reports',video_groups:'save_template',ad_campaigns:'system_settings'};
  if(tables[table])return require('plan.'+tables[table]);
  const rpcs={get_client_customer:'view_students',get_client_tasks:'view_plan',get_master_tasks:'view_plan'};
  if(table.startsWith('rpc/')&&rpcs[table.slice(4)])return require('plan.'+rpcs[table.slice(4)]);
  return deny();
 }
 if(path==='/api/state'){
  const view=url.searchParams.get('shell')||url.searchParams.get('view');if(['dashboard','content','comments','inbox','products','reports','phacdo','settings'].includes(view))require('menu.'+view);return;
 }
 const groups=[[/^\/api\/(contents|publications|copy)(\/|$)/,'content'],[/^\/api\/campaigns(\/|$)/,'campaigns'],[/^\/api\/comments(\/|$)/,'comments'],[/^\/api\/(chat|conversations|messages)(\/|$)/,'inbox'],[/^\/api\/products(\/|$)/,'products'],[/^\/api\/(orders|order-address)(\/|$)/,'orders'],[/^\/api\/(reports|overview|system\/metrics)(\/|$)/,'reports'],[/^\/api\/plans(\/|$)/,'phacdo']];
 for(const [pattern,menu]of groups)if(pattern.test(path)){if(menu==='inbox'&&(conversation||hasAccess(user,'menu.comments')))break;require('menu.'+menu);break;}
 const record=path.match(/^\/api\/records\/([^/]+)/);if(record){const menu={contents:'content',publications:'content',campaigns:'campaigns',products:'products',orders:'orders',conversations:'inbox',messages:'inbox'}[record[1]];if(menu)require('menu.'+menu);}
 if(path.startsWith('/api/plans/'))require('plan.'+(write?'edit_plan':'view_plan'));
 const setting=[[/^\/api\/(connections|oauth)/,'all'],[/^\/api\/chatbots?/,'chatbot'],[/^\/api\/(teams|channel-teams)/,'care-admin'],[/^\/api\/(backup|export|audit)/,'data'],[/^\/api\/customers\/directory/,'customers'],[/^\/api\/quick-replies/,'quick-replies'],[/^\/api\/conversation-tags/,'conversation-tags'],[/^\/api\/pancake/,'pancake-pos'],[/^\/api\/taophacdo/,'integration']].find(([p])=>p.test(path));
 if(setting){require('menu.settings');require('settings.'+setting[1]);}
}
export async function guardPlanCustomerWrite(user,method,url,input,read){
 if(user.role==='owner'||['GET','HEAD','DELETE'].includes(method))return;
 const check=key=>assertAccess(user,'plan.'+key),requireOne=keys=>{if(!keys.some(k=>hasAccess(user,'plan.'+k)))deny();};
 const rows=Array.isArray(input)?input:[input];if(rows.length>100)deny();
 for(const patch of rows){
  const lookup=new URL(url);lookup.searchParams.set('select','id,customer_id,email,pending_email,status,video_date,is_customized');lookup.searchParams.set('limit','1001');
  if(method==='POST'){const key=patch.customer_id?'customer_id':patch.id?'id':null;if(!key)deny();lookup.search='?select=id,customer_id,email,pending_email,status,video_date,is_customized&'+key+'=eq.'+encodeURIComponent(patch[key])+'&limit=2';}
  const previous=await read(lookup);if(!Array.isArray(previous)||previous.length>1000)deny();
  if(!previous.length){if(method==='POST')check('add_student');continue;}
  for(const old of previous){
   const other=Object.keys(patch).filter(k=>!['id','customer_id','email','pending_email','status','updated_at'].includes(k));
   if(other.length)check('edit_student');
   if(patch.email!==undefined&&patch.email!==old.email){if(patch.email===old.pending_email&&patch.pending_email==='')requireOne(['approve_email','edit_email']);else check('edit_email');}
   if(patch.pending_email!==undefined&&patch.pending_email!==old.pending_email)requireOne(['approve_email','edit_email']);
   if(patch.status==='DELETED'&&old.status!=='DELETED')check('delete_student');
   if(patch.status!==undefined&&patch.status!=='DELETED'&&old.status==='DELETED')check('restore_student');
   if(['video_date','is_customized'].some(k=>patch[k]!==undefined&&patch[k]!==old[k]))check('edit_plan');
   // A status-only normal edit still needs the ordinary learner edit capability.
   if(patch.status!==undefined&&old.status!=='DELETED'&&patch.status!=='DELETED'&&patch.status!==old.status)check('edit_student');
  }
 }
}
export function scopeAccessState(state,user){
 if(user.role==='owner')return state;const copy={...state};const clear=(key,fields)=>{if(!hasAccess(user,key))for(const field of fields)if(Array.isArray(copy[field]))copy[field]=[];};
 clear('menu.content',['contents','publications','copyPlanSummaries','copyPlanCalendar']);clear('menu.campaigns',['campaigns']);clear('menu.orders',['orders','payments','returns']);clear('menu.products',['products']);clear('menu.phacdo',['plan_handoffs','study_plans','savedPlanSummaries']);
 const allowed=(state.conversations||[]).filter(c=>hasAccess(user,c.kind==='comment'?'menu.comments':'menu.inbox')),ids=new Set(allowed.map(c=>c.id));copy.conversations=allowed;copy.messages=(state.messages||[]).filter(m=>ids.has(m.conversationId));
 if(!hasAccess(user,'settings.access'))copy.users=(state.users||[]).map(u=>u.id===user.id?u:{id:u.id,name:u.name,role:u.role,active:u.active});
 return copy;
}
