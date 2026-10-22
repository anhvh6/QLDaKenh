import {all,get,secret} from './store.mjs';
import {sourceVideoKey} from './copy-source-key.mjs';

export function copyStorageScope(userId){
 const drive=secret('drive-'+userId),app=secret('drive-oauth');
 return drive.account?JSON.stringify([drive.account.toLowerCase(),drive.googleClientId||app.clientId]):'user:'+userId;
}
export function reusableCopies(userId,post){
 const key=sourceVideoKey(post);if(!key)return [];
 return all('copy_jobs').filter(j=>j.userId&&j.postId&&j.status==='done'&&!j.hiddenAt&&j.driveSaved&&j.folderId&&j.assets?.length&&(j.storageScope||copyStorageScope(j.userId))===copyStorageScope(userId)&&sourceVideoKey(get('copy_posts',j.postId))===key&&j.assets.every(id=>get('assets',id)?.active!==false&&get('assets',id))).sort((a,b)=>String(a.completedAt||a.createdAt).localeCompare(String(b.completedAt||b.createdAt)));
}
