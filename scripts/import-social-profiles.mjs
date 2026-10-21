import {readFileSync} from 'node:fs';
import {all,db} from '../server/store.mjs';
import {editRecord} from '../server/domain.mjs';
import {providers} from '../server/connectors.mjs';

const file=process.argv[process.argv.indexOf('--file')+1];
if(!process.argv.includes('--file')||!file)throw new Error('Dùng --file profiles.json [--apply]');
const profiles=JSON.parse(readFileSync(file,'utf8'));
if(!Array.isArray(profiles)||profiles.length>100)throw new Error('Danh sách tối đa 100 kênh.');
const owner=db.prepare("SELECT id,role FROM users WHERE role='owner' AND active=1 LIMIT 1").get();
if(!owner)throw new Error('Chưa có chủ hệ thống.');
const result=[];
for(const profile of profiles){
 if(!providers[profile.provider]||!profile.name||!profile.profileUrl)throw new Error('Hồ sơ thiếu nền tảng, tên hoặc liên kết.');
 const url=new URL(profile.profileUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Liên kết hồ sơ phải là HTTPS.');
 const existing=all('connections').find(c=>!c.deletedAt&&c.provider===profile.provider&&(c.profileUrl===url.href||(profile.accountId&&String(c.accountId)===String(profile.accountId))||(profile.expectedAccount&&c.expectedAccount===profile.expectedAccount)));
 if(existing){result.push({name:profile.name,status:'existing',id:existing.id});continue;}
 const p=providers[profile.provider],data={provider:profile.provider,name:String(profile.name).slice(0,200),mode:p.publish||p.oauth?'api':'assisted',accountId:String(profile.accountId||''),expectedAccount:String(profile.expectedAccount||''),profileUrl:url.href,connectionNote:String(profile.note||'')};
 const record=process.argv.includes('--apply')?editRecord(owner,'connections',null,data):null;
 result.push({name:profile.name,status:record?'added_pending':'would_add',id:record?.id});
}
console.log(JSON.stringify(result,null,2));db.close();
