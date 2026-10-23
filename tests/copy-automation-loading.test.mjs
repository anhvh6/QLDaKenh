import test from 'node:test';
import assert from 'node:assert/strict';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('initial loading, campaign changes and multi-plan selection paint without a second change',async()=>{
 const saved={document:global.document,window:global.window,setInterval:global.setInterval},handlers={},polls=[];
 const root={innerHTML:'',contains:()=>true,querySelector:()=>null,querySelectorAll:()=>[]};
 global.document={hidden:false,activeElement:null,scrollingElement:{scrollTop:0},querySelector:s=>s==='#copy-auto-body'?root:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn)};
 global.window={addEventListener:()=>{}};global.setInterval=fn=>{polls.push(fn);return 0;};
 try{
  const mod=await import('../public/copy-automation.js?loading-multi-test');let release;
  let response={sources:[],videos:[],plans:[],items:[],events:[]},delay=true;
  const host={state:{user:{id:'owner'},campaigns:[{id:'a',name:'Campaign A',status:'active',createdAt:'2026-10-21'},{id:'b',name:'Campaign B',status:'paused',createdAt:'2026-10-23'}],connections:[],providers:{}},api:()=>delay?new Promise(r=>release=r):Promise.resolve(response),render:()=>{root.innerHTML=mod.automationPage();mod.enhanceAutomation();},toast:e=>assert.fail(e)};
  mod.initAutomation(host);
  const button={dataset:{auto:'mode',id:'new'}};
  const click=()=>handlers.click[0]({target:{closest:s=>s==='[data-auto]'?button:null},preventDefault:()=>{}});
  const change=async(id,value='',dataset={},checked=false)=>{const el={id,value,dataset,checked,matches:()=>false,closest:()=>null};for(const fn of handlers.change)await fn({target:el});await settle();};
  global.document.activeElement={id:'auto-campaign-filter',closest:s=>s==='#auto-plan-manager'?{}:s==='form,input,textarea,select'?{}:null};
  await click();
  assert.match(root.innerHTML,/value="b" selected>Campaign B/);
  assert.match(root.innerHTML,/Đang tải kế hoạch/);
  response={...response,plans:[{id:'p1',name:'Loaded plan A',campaignId:'a',mode:'new',status:'active'},{id:'p2',name:'Loaded plan A2',campaignId:'a',mode:'new',status:'paused'},{id:'p3',name:'Loaded plan B',campaignId:'b',mode:'new',status:'paused'}],items:[{id:'i1',planId:'p1',caption:'Result A1',state:'pending'},{id:'i2',planId:'p2',caption:'Result A2',state:'pending'},{id:'i3',planId:'p3',caption:'Result B',state:'pending'}]};
  delay=false;release(response);await settle();
  assert.match(root.innerHTML,/Loaded plan B/);assert.match(root.innerHTML,/Tất cả kế hoạch \(1\)/);
  await change('auto-campaign-filter','');
  assert.match(root.innerHTML,/Loaded plan A2/);assert.match(root.innerHTML,/Tất cả kế hoạch \(3\)/);
  assert.match(root.innerHTML,/Result A1/);assert.match(root.innerHTML,/Result A2/);assert.match(root.innerHTML,/Result B/);
  await change('auto-campaign-filter','a');
  assert.match(root.innerHTML,/Tất cả kế hoạch \(2\)/);assert.doesNotMatch(root.innerHTML,/Result B/);
  await change('auto-all-plans','',{},false);assert.doesNotMatch(root.innerHTML,/Result A1/);
  await change('','',{autoPlanId:'p1'},true);assert.match(root.innerHTML,/Result A1/);assert.doesNotMatch(root.innerHTML,/Result A2/);
  await change('','',{autoPlanId:'p2'},true);assert.match(root.innerHTML,/Result A2/);assert.match(root.innerHTML,/id="auto-all-plans" type="checkbox" checked/);
  await change('auto-campaign-filter','b');assert.match(root.innerHTML,/Result B/);assert.doesNotMatch(root.innerHTML,/Result A1/);
  // An asynchronous refresh must still populate the open plan picker.
  global.document.activeElement={id:'auto-plan-search',closest:s=>s==='#auto-plan-manager'?{}:null};
  response={...response,plans:[...response.plans,{id:'p4',name:'Late plan B',campaignId:'b',mode:'new',status:'active'}]};
  polls[0]();await settle();assert.match(root.innerHTML,/Late plan B/);
  // A source form draft remains protected, and identical subsequent responses retry the deferred paint.
  global.document.activeElement={id:'source-input',closest:s=>s==='form,input,textarea,select'?{}:null};
  response={...response,plans:response.plans.map(p=>p.id==='p4'?{...p,name:'Updated late plan'}:p)};
  polls[0]();await settle();assert.doesNotMatch(root.innerHTML,/Updated late plan/);
  global.document.activeElement=null;polls[0]();await settle();assert.match(root.innerHTML,/Updated late plan/);
  // Late campaign metadata cannot hide already-loaded plans.
  host.state.campaigns=[];host.render();polls[0]();await settle();assert.match(root.innerHTML,/Updated late plan/);
 }finally{Object.assign(global,saved);}
});

test('plan picker is usable before the heavy results request finishes',async()=>{
 const saved={document:global.document,window:global.window,setInterval:global.setInterval},handlers={};
 const root={innerHTML:'',contains:()=>true,querySelector:()=>null,querySelectorAll:()=>[]};
 global.document={hidden:false,activeElement:null,scrollingElement:{scrollTop:0},querySelector:s=>s==='#copy-auto-body'?root:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn)};
 global.window={addEventListener:()=>{}};global.setInterval=()=>0;
 try{
  const mod=await import('../public/copy-automation.js?fast-catalog-test');let release;
  const plans=[{id:'plan',name:'Fast plan',campaignId:'newest',mode:'new',status:'active',times:[],weekdays:[]}];
  const host={state:{user:{id:'owner'},campaigns:[{id:'old',name:'Old',createdAt:'2026-10-01'},{id:'newest',name:'Newest',createdAt:'2026-10-23'}],connections:[],providers:{}},api:path=>path.endsWith('/catalog')?Promise.resolve({plans,sources:[]}):new Promise(r=>release=r),render:()=>{root.innerHTML=mod.automationPage();},toast:e=>assert.fail(e)};
  mod.initAutomation(host);
  const button={dataset:{auto:'mode',id:'new'}};
  await handlers.click[0]({target:{closest:s=>s==='[data-auto]'?button:null},preventDefault:()=>{}});await settle();
  assert.match(root.innerHTML,/Fast plan/);assert.match(root.innerHTML,/value="newest" selected/);
  assert.match(root.innerHTML,/Đang tải kết quả/);
  release({plans,sources:[],items:[{id:'item',planId:'plan',caption:'Loaded later',state:'pending'}],videos:[],events:[]});await settle();
  assert.match(root.innerHTML,/Loaded later/);assert.doesNotMatch(root.innerHTML,/Đang tải kết quả/);
 }finally{Object.assign(global,saved);}
});
