import {spawn} from 'node:child_process';
import {mkdir,stat,rename,unlink} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {get,dataDir} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
const pending=new Map(),failed=new Map(),queue=[];let active=0;
// Natural dimensions identify transient placeholders without fetching video files.
const placeholder=width=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1" viewBox="0 0 480 270"><rect width="480" height="270" fill="#e9f0ed"/><path d="M218 105v60l52-30z" fill="#28664f"/><text x="240" y="210" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#28664f">Video</text></svg>`);
const fallback=placeholder(2),failedFallback=placeholder(1);
function enqueue(work){return new Promise((resolve,reject)=>{queue.push({work,resolve,reject});drain();});}
function drain(){while(active<2&&queue.length){const job=queue.shift();active++;Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{active--;drain();});}}
async function exists(path){try{return await stat(path);}catch{return null;}}
async function generateThumbnail(source,temp){await new Promise((resolve,reject)=>{const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-threads','1','-filter_threads','1','-i',source,'-frames:v','1','-vf','scale=480:480:force_original_aspect_ratio=decrease','-q:v','5','-y',temp],{windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>child.kill(),8000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('thumbnail'));});});}
export async function mediaThumbnail(user,id,{generate=generateThumbnail,waitMs=200}={}){
 permission(user,'read');const a=get('assets',id);if(!a||!['video','image'].includes(a.type)||!/^\/uploads\/[\w.-]+$/.test(a.url||''))fail('Không tìm thấy video.',404);
 if(a.connectionId)assertChannel(user,a.connectionId);
 const source=join(dataDir,'uploads',basename(a.url)),info=await exists(source);if(!info)fail('Không tìm thấy video.',404);
 const fallbackResult=a.type==='image'?{path:source}:{fallback,status:'pending'};
 if(a.type==='image'&&info.size<=65536)return {path:source};
 const key=createHash('sha256').update(a.id+':'+info.size+':'+info.mtimeMs).digest('hex'),folder=join(dataDir,'thumbnails'),target=join(folder,key+'.jpg');
 if(await exists(target))return {path:target};
 if((failed.get(key)||0)>Date.now())return a.type==='image'?fallbackResult:{fallback:failedFallback,status:'failed'};
 if(pending.size>=24)return fallbackResult;
 if(!pending.has(key)){
  const task=enqueue(async()=>{
   const temp=target+'.tmp.jpg';
   try{await mkdir(folder,{recursive:true});await generate(source,temp);await rename(temp,target);return {path:target};}
   catch{await unlink(temp).catch(()=>{});failed.set(key,Date.now()+60000);if(failed.size>512)failed.delete(failed.keys().next().value);return a.type==='image'?fallbackResult:{fallback:failedFallback,status:'failed'};}
  });pending.set(key,task);task.then(()=>pending.delete(key),()=>pending.delete(key));
 }
 // A cold image or a busy thumbnail queue must not hold the page for seconds.
 return Promise.race([pending.get(key),new Promise(resolve=>setTimeout(()=>resolve(fallbackResult),waitMs))]);
}
