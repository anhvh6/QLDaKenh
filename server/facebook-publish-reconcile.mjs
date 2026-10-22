// Match an ambiguous video write only with a unique, published video on the target Page.
export function facebookVideoReceipt(publication,videos){
 const start=Date.parse(publication.dispatchedAt||publication.scheduleAt),caption=String(publication.caption||'').trim();
 if(!Number.isFinite(start)||!caption)return null;
 const matches=videos.filter(v=>String(v.description||'').trim()===caption&&Math.abs(Date.parse(v.created_time)-start)<=5*60000);
 if(matches.length!==1)return null;
 const v=matches[0];if(v.status?.video_status!=='ready'||v.status?.publishing_phase?.publish_status!=='published')return null;
 let url;try{url=new URL(v.permalink_url,'https://www.facebook.com');}catch{return null;}
 if(url.protocol!=='https:'||!['www.facebook.com','facebook.com'].includes(url.hostname))return null;
 return {externalId:String(v.id),url:url.href,publishedAt:new Date(v.created_time).toISOString()};
}
