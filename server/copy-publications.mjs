export function copyPublicationResults(publications,connections){
 const channels=new Map(connections.map(c=>[c.id,c])),latest=new Map();
 for(const p of publications.slice().sort((a,b)=>String(b.createdAt||b.updatedAt||'').localeCompare(String(a.createdAt||a.updatedAt||''))))if(!latest.has(p.connectionId||p.channelId||p.id))latest.set(p.connectionId||p.channelId||p.id,p);
 return [...latest.values()].map(p=>{const c=channels.get(p.connectionId);return {publicationId:p.id,connectionId:p.connectionId,provider:c?.provider||p.provider||'',channelName:c?.remoteName||c?.name||p.channelName||p.connectionId||'',status:p.status,success:['published','manually_confirmed'].includes(p.status),error:p.error||(['failed','blocked','unknown'].includes(p.status)?'Chưa đăng thành công. Kiểm tra kết quả trước khi thử lại.':''),url:p.url||''};});
}
