import {spawn} from 'node:child_process';
import {mkdir,stat,rename,unlink} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {get,dataDir} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
const pending=new Map(),failed=new Map();let tail=Promise.resolve();
const fallback=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#e9f0ed"/><path d="M218 105v60l52-30z" fill="#28664f"/><text x="240" y="210" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#28664f">Video</text></svg>');
async function exists(path){try{return await stat(path);}catch{return null;}}
export async function mediaThumbnail(user,id){
 permission(user,'read');const a=get('assets',id);if(!a||a.type!=='video'||!/^\/uploads\/[\w.-]+$/.test(a.url||''))fail('Không tìm thấy video.',404);
 if(a.connectionId)assertChannel(user,a.connectionId);
 const source=join(dataDir,'uploads',basename(a.url)),info=await exists(source);if(!info)fail('Không tìm thấy video.',404);
 const key=createHash('sha256').update(a.id+':'+info.size+':'+info.mtimeMs).digest('hex'),folder=join(dataDir,'thumbnails'),target=join(folder,key+'.jpg');
 if(await exists(target))return {path:target};
 if((failed.get(key)||0)>Date.now()||pending.size>=24)return {fallback};
 if(!pending.has(key)){
  const task=tail.catch(()=>{}).then(async()=>{
   const temp=target+'.tmp.jpg';
   try{await mkdir(folder,{recursive:true});await new Promise((resolve,reject)=>{const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-threads','1','-i',source,'-frames:v','1','-vf','scale=480:270:force_original_aspect_ratio=decrease','-q:v','5','-y',temp],{windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>child.kill(),8000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('thumbnail'));});});await rename(temp,target);return {path:target};}
   catch{await unlink(temp).catch(()=>{});failed.set(key,Date.now()+60000);if(failed.size>512)failed.delete(failed.keys().next().value);return {fallback};}
  });pending.set(key,task);tail=task;task.then(()=>pending.delete(key),()=>pending.delete(key));
 }
 return pending.get(key);
}
