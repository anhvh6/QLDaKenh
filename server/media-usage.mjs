// Count each send/publication once for each asset, even if it has repeated attachments.
export function mediaUsage(assets,messages,publications){
 const result=new Map(assets.map(a=>[a.id,{count:0,lastAt:null}])),urls=new Map();
 for(const a of assets){const ids=urls.get(a.url)||[];ids.push(a.id);urls.set(a.url,ids);}
 const add=(ids,event)=>{for(const id of ids){const usage=result.get(id);if(!usage)continue;usage.count++;const stamp=event.publishedAt||event.createdAt;if(stamp&&(!usage.lastAt||stamp>usage.lastAt))usage.lastAt=stamp;}};
 for(const m of messages){if(m.direction!=='outgoing'||!['accepted','sent','delivered','read'].includes(m.status))continue;const ids=new Set();for(const a of m.attachments||[]){if(result.has(a.assetId))ids.add(a.assetId);for(const id of urls.get(a.url)||[])ids.add(id);}add(ids,m);}
 for(const p of publications)if(['published','manually_confirmed'].includes(p.status))add(new Set(p.assets||[]),p);
 return result;
}
