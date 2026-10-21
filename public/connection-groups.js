export const connectionGroups=[['attention','Cần xử lý'],['connecting','Đang kết nối'],['pending','Chưa xác thực'],['connected','Đã kết nối'],['manual','Hỗ trợ thủ công'],['disconnected','Đã ngắt']];
export function connectionGroup(c){
 if(c.status==='disconnected')return 'disconnected';
 if(c.mode==='assisted')return 'manual';
 if(['connecting','reconnecting'].includes(c.status)||['connecting','reconnecting','waiting_key'].includes(c.listenerState))return 'connecting';
 if(c.status==='error'||c.health?.checks?.some(x=>x.status==='error')||(c.provider==='zalo_personal'&&c.status==='connected'&&c.listenerState!=='listening'))return 'attention';
 return c.status==='connected'?'connected':'pending';
}
export function groupConnections(channels){
 const real=channels.filter(c=>!c.deletedAt&&c.mode!=='demo'&&c.status!=='demo');
 return connectionGroups.map(([key,label])=>({key,label,channels:real.filter(c=>connectionGroup(c)===key)})).filter(g=>g.channels.length);
}
