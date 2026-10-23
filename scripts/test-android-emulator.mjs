import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const exec=promisify(execFile),adb=process.env.ANDROID_ADB||'adb',serial=process.env.ANDROID_SERIAL||'emulator-5556';
const apk=resolve(process.argv[2]||'releases/android/MeGa-Phuong-1.0.2.apk');
const output=resolve(process.argv[3]||'releases/android/qa-1.0.2');
const pkg='vn.megaphuong.qldakenh',report={serial,apk,cases:[],physicalSamsungTested:false};
const run=async(...args)=>(await exec(adb,['-s',serial,...args],{maxBuffer:8*1024*1024,timeout:120000})).stdout;
const settle=()=>new Promise(r=>setTimeout(r,2500));
async function assertNoCrash(name){
 const crash=await run('logcat','-d','-b','crash','-v','threadtime');
 await writeFile(join(output,name+'-crash.txt'),crash);
 assert.ok(!crash.includes('Process: '+pkg),name+': native app crash');
}
async function capture(name){
 await run('shell','screencap','-p','/sdcard/megaphuong-qa.png');
 await run('pull','/sdcard/megaphuong-qa.png',join(output,name+'.png'));
}
async function waitForWorkspace(name){
 const start=Date.now();
 while(Date.now()-start<60000){
  // Accessibility can be temporarily unavailable while Chrome attaches its WebView.
  const dumped=await exec(adb,['-s',serial,'shell','uiautomator','dump','--compressed','/sdcard/megaphuong-qa-ui.xml'],{timeout:15000}).then(r=>r.stdout).catch(()=>'');
  if(!dumped.includes('dumped to:')){await new Promise(r=>setTimeout(r,1000));continue;}
  const xml=await run('shell','cat','/sdcard/megaphuong-qa-ui.xml');
  if(xml.includes('text="Đăng nhập"'))throw Error(name+': login session lost');
  if(['Hộp thư','Chưa đọc','Lợi nhuận','Xem lịch'].some(text=>xml.includes('text="'+text+'"')))return Date.now()-start;
  await new Promise(r=>setTimeout(r,1000));
 }
 throw Error(name+': workspace did not become usable within 60 seconds');
}
await mkdir(output,{recursive:true});
try{
 assert.match(await run('shell','getprop','sys.boot_completed'),/1/);
 assert.match(await run('install','-r',apk),/Success/);
 await run('logcat','-c');
 report.android=(await run('shell','getprop','ro.build.version.release')).trim();
 for(let i=1;i<=5;i++){
  await run('shell','am','force-stop',pkg);
  await run('shell','am','force-stop','com.android.chrome');
  const started=await run('shell','am','start','-W','-n',pkg+'/.MainActivity');
  await settle();await assertNoCrash('cold-start-'+i);
  const readyMs=await waitForWorkspace('cold-start-'+i);
  report.cases.push({name:'cold-start-'+i,passed:true,launch:started,readyMs});
  console.log('cold-start-'+i+': workspace ready, '+readyMs+'ms');
 }
 await capture('phone');
 for(const [name,size]of [['unfolded','2208x1840'],['landscape','2340x1080'],['phone-restored','1080x2340']]){
  await run('shell','wm','size',size);await settle();await assertNoCrash(name);
  const readyMs=await waitForWorkspace(name);await capture(name);
  const active=await run('shell','dumpsys','activity','activities');
  assert.ok(active.includes('com.android.chrome'),name+': browser activity missing');
  report.cases.push({name,passed:true,size,readyMs});
 }
 report.notifications='Must be verified separately through actual Web Push, visible notification, display receipt and click target; startup success does not imply push success.';
}catch(error){report.error=error.message;process.exitCode=1;}finally{
 await run('shell','wm','size','reset').catch(()=>{});
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
