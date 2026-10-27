let pending:Promise<any>|null=null;
const read=()=>pending||(pending=fetch('/api/access/me',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Không thể đọc quyền tài khoản');return r.json();}).finally(()=>{pending=null;}));
export const permissionService={
 getRoles:async()=>{const d=await read();return [{name:d.user.role,display_name:d.user.name}];},
 getPermissions:async()=>{const d=await read();return d.catalog.filter((p:any)=>p.id.startsWith('plan.')).map((p:any)=>({code:p.id.slice(5),display_name:p.label}));},
 getRolePermissions:async()=>{const d=await read();return d.catalog.filter((p:any)=>p.id.startsWith('plan.')&&d.user.access[p.id]).map((p:any)=>({role_name:d.user.role,permission_code:p.id.slice(5)}));}
};
