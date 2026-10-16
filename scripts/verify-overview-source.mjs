// Read-only verification through the application's existing management API.
// The temporary local login/database never modifies the production workspace or source data.
import {spawn} from 'node:child_process';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {readOverviewSource} from '../public/dashboard-overview.js';
if(!process.argv.includes('--live-read'))throw Error('Pass --live-read to verify the existing read-only management source.');
const port=4472,base='http://127.0.0.1:'+port,child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:mkdtempSync(join(tmpdir(),'overview-source-check-')),PLAN_REMOTE_CATALOG:'0'},stdio:'ignore',windowsHide:true});
try{
 let ready=false;for(let n=0;n<80;n++){try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Temporary verification server did not start.');
 const setup=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Local read-only verification',email:'local-check@example.test',password:crypto.randomUUID(),demo:false})});if(!setup.ok)throw Error('Temporary local setup failed.');const cookie=setup.headers.get('set-cookie')?.split(';')[0];
 const result=await readOverviewSource(async path=>{const r=await fetch(base+'/api'+path,{headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Existing management API returned HTTP '+r.status);return r.json();});console.log(JSON.stringify({readOnly:true,source:'existing management API',summary:result}));
}finally{child.kill();}
