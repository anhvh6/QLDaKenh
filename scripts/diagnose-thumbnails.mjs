import {all} from '../server/store.mjs';
import {mediaThumbnail} from '../server/media-thumbnail.mjs';
import {spawnSync} from 'node:child_process';
const ffmpeg=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-version'],{windowsHide:true,encoding:'utf8',timeout:5000});
console.log(JSON.stringify({probe:'ffmpeg',available:ffmpeg.status===0}));
if(ffmpeg.status!==0)process.exitCode=1;
else {
 const videos=all('assets').filter(a=>a.type==='video'&&/^\/uploads\/[\w.-]+$/.test(a.url||''));
 console.log(JSON.stringify({probe:'local-video-count',videos:videos.length}));
 // Sample serially to avoid competing with normal thumbnail generation.
 for(const asset of videos.slice(-6)){
  const start=performance.now();try{const result=await mediaThumbnail({id:'diagnostic',role:'owner'},asset.id,{waitMs:9000});console.log(JSON.stringify({probe:'thumbnail',status:result.path?'ready':result.status,ms:Math.round(performance.now()-start)}));}
  catch(error){console.log(JSON.stringify({probe:'thumbnail',status:'unavailable',http:error.status||500,ms:Math.round(performance.now()-start)}));}
 }
}
