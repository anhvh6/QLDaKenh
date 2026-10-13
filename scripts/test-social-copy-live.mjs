// Read user-supplied public posts into a separate temporary store; never publish.
if(!process.env.DATA_DIR||!process.env.DATA_DIR.includes('copy-live-'))throw new Error('Set DATA_DIR to a separate copy-live- temporary directory.');
process.env.PLAN_REMOTE_CATALOG='0';
const {get}=await import('../server/store.mjs');
const {copyRoute,copyArchive}=await import('../server/social-copy.mjs');
const {stat}=await import('node:fs/promises');
const user={id:'live-qa',role:'owner'};
for(const url of process.argv.slice(2)){
 const started=Date.now(),post=await copyRoute('/api/copy/preview','POST',{url},user,new URL('https://example.test/api/copy/preview'));
 const job=await copyRoute('/api/copy/download','POST',{postId:post.id,target:'device'},user,new URL('https://example.test/api/copy/download'));
 let result;for(let i=0;i<180;i++){result=get('copy_jobs',job.id);if(['done','failed'].includes(result.status))break;await new Promise(r=>setTimeout(r,2000));}
 if(result.status!=='done')throw new Error(result.error||'Timed out waiting for package.');
 console.log({platform:post.provider,media:post.media.length,captionLength:post.caption.length,assets:result.assets.length,zipBytes:(await stat(copyArchive(user,job.id))).size,elapsedMs:Date.now()-started});
}
