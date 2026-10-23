import test from 'node:test';
import assert from 'node:assert/strict';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('plan loading recovers focused empty selectors, deferred rendering and late campaigns',async()=>{
 const saved={document:global.document,window:global.window,setInterval:global.setInterval},handlers={},polls=[];
 const root={innerHTML:'',contains:()=>true,querySelector:()=>null,querySelectorAll:()=>[]};
 global.document={hidden:false,activeElement:null,scrollingElement:{scrollTop:0},querySelector:s=>s==='#copy-auto-body'?root:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn)};
 global.window={addEventListener:()=>{}};global.setInterval=fn=>{polls.push(fn);return 0;};
 try{
  const mod=await import('../public/copy-automation.js?loading-test');let release;
  let response={sources:[],videos:[],plans:[],items:[],events:[]},delay=true;
  const host={state:{user:{id:'owner'},campaigns:[{id:'campaign',name:'Selected campaign',status:'active'}],connections:[],providers:{}},api:()=>delay?new Promise(r=>release=r):Promise.resolve(response),render:()=>{root.innerHTML=mod.automationPage();},toast:e=>assert.fail(e)};
  mod.initAutomation(host);
  const picker={id:'auto-plan-filter',value:'',closest:()=>true};global.document.activeElement=picker;
  const button={dataset:{auto:'mode',id:'new'}};
  await handlers.click[0]({target:{closest:s=>s==='[data-auto]'?button:null},preventDefault:()=>{}});
  assert.match(root.innerHTML,/Chưa có kế hoạch/);
  response={...response,plans:[{id:'plan',name:'Loaded plan',campaignId:'campaign',mode:'new',status:'active',times:['08:00'],weekdays:[1],channels:[]}]};delay=false;release(response);await settle();
  assert.match(root.innerHTML,/value="plan" selected/);assert.match(root.innerHTML,/Loaded plan/);
  // A real input draft must remain intact until focus leaves the form.
  picker.value='plan';response={...response,plans:[{...response.plans[0],name:'Updated plan'}]};
  polls[0]();await settle();assert.doesNotMatch(root.innerHTML,/Updated plan/);
  // An identical API response must retry a previously skipped paint.
  global.document.activeElement=null;polls[0]();await settle();assert.match(root.innerHTML,/Updated plan/);
  picker.value='plan';global.document.activeElement=picker;response={...response,plans:[{...response.plans[0],name:'After blur'}]};polls[0]();await settle();assert.doesNotMatch(root.innerHTML,/After blur/);
  global.document.activeElement=null;for(const h of handlers.focusout)h();await new Promise(r=>setTimeout(r,10));assert.match(root.innerHTML,/After blur/);
  // Campaign data can load after the automation response; unchanged plans still normalize.
  host.state.campaigns=[];host.render();polls[0]();await settle();host.state.campaigns=[{id:'campaign',name:'Selected campaign',status:'active'}];polls[0]();await settle();assert.match(root.innerHTML,/value="campaign" selected/);assert.match(root.innerHTML,/value="plan" selected/);
 }finally{Object.assign(global,saved);}
});
