import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {basename,join} from 'node:path';
import {dataDir,get,saveSecret,secret} from './store.mjs';

const secretId='public-media-signing';
function signingKey(){let value=secret(secretId).key;if(!value){value=randomBytes(32).toString('hex');saveSecret(secretId,{key:value});}return value;}
const signature=id=>createHmac('sha256',signingKey()).update(String(id)).digest('hex');

export function publicMediaUrl(asset){
 const base=String(process.env.OAUTH_BASE_URL||'').replace(/\/$/,'');
 let url;try{url=new URL(base);}catch{throw new Error('Cấu hình OAUTH_BASE_URL bằng URL HTTPS ngrok để Facebook tải được media.');}
 if(url.protocol!=='https:')throw new Error('OAUTH_BASE_URL phải là URL HTTPS công khai để đăng ảnh/video.');
 return `${url.origin}/public-media/${encodeURIComponent(asset.id)}/${signature(asset.id)}`;
}

export function publicMediaFile(pathname){
 const match=pathname.match(/^\/public-media\/([^/]+)\/([a-f0-9]{64})$/);if(!match)return null;
 const id=decodeURIComponent(match[1]),expected=signature(id),provided=match[2];
 if(provided.length!==expected.length||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return null;
 const asset=get('assets',id);if(!asset||asset.active===false||!/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(asset.url))return null;
 return join(dataDir,'uploads',basename(asset.url));
}
