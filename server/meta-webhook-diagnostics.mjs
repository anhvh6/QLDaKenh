// Keep routing metadata only: never persist message bodies, attachments or credentials.
export function describeMetaWebhook(payload={}) {
 const entries=(Array.isArray(payload.entry)?payload.entry:[]).slice(0,100).map(entry=>{
  const messaging=Array.isArray(entry.messaging)?entry.messaging:[],standby=Array.isArray(entry.standby)?entry.standby:[],changes=Array.isArray(entry.changes)?entry.changes:[];
  return {id:String(entry.id||'').slice(0,100),messaging:messaging.length,standby:standby.length,fields:[...new Set(changes.map(c=>String(c.field||'').slice(0,100)))],messageEvents:messaging.filter(e=>e.message?.mid).length,standbyMessages:standby.filter(e=>e.message?.mid).length,peers:[...new Set([...messaging,...standby].flatMap(e=>[e.sender?.id,e.recipient?.id]).filter(Boolean).map(String))].slice(0,100)};
 });
 return {object:String(payload.object||'').slice(0,100),entries};
}

export function channelWebhookSummary(channel,description) {
 const id=String(channel.accountId||'');
 if(!id)return null;
 const entries=description.entries.filter(e=>e.id===id||e.peers.includes(id));
 if(!entries.length)return null;
 return {eventCount:entries.reduce((n,e)=>n+e.messaging+e.standby+e.fields.length,0),messageEvents:entries.reduce((n,e)=>n+e.messageEvents,0),standbyMessages:entries.reduce((n,e)=>n+e.standbyMessages,0),fields:[...new Set(entries.flatMap(e=>e.fields))]};
}
