import {db,get,getSupabaseHeaders} from '../server/store.mjs';
import {accessId,accessConfig,importLegacyAccess} from '../server/access-control.mjs';
import {readLegacyAccessSource} from '../server/access-source.mjs';
try{
 let config=accessConfig();if(!config?.imported){config=importLegacyAccess(await readLegacyAccessSource(await getSupabaseHeaders()));}
 const users=db.prepare('SELECT id,role,active FROM users').all().filter(u=>!config.users[u.id]?.deletedAt);
 console.log(JSON.stringify({ready:config.imported,roles:config.roles.length,permissions:config.catalog.length,users:users.length,active:users.filter(u=>u.active).length,waitingForPassword:users.filter(u=>config.users[u.id]?.needsPassword).length,missingRoles:users.filter(u=>!config.roles.some(r=>r.id===u.role)).length}));
}catch{console.log(JSON.stringify({ready:false,message:'Chưa đọc được nguồn quyền phác đồ. Mở Cài đặt > Quyền/ tài khoản để thử lại bằng kết nối backend hiện có.'}));process.exitCode=1;}
