export function hashtagMatches(text){return [...String(text||'').matchAll(/(^|[\s(])#([\p{L}\p{N}_]+)(?=$|[^\p{L}\p{N}_])/gu)].map(m=>({tag:m[2],index:m.index+m[1].length,text:'#'+m[2]}));}
export const hashtags=text=>[...new Set(hashtagMatches(text).map(m=>m.tag))];
export function hashtagFacets(text){const encoder=new TextEncoder();return hashtagMatches(text).map(m=>({index:{byteStart:encoder.encode(text.slice(0,m.index)).length,byteEnd:encoder.encode(text.slice(0,m.index+m.text.length)).length},features:[{$type:'app.bsky.richtext.facet#tag',tag:m.tag}]}));}
export function platformTextIssues(provider,{title='',caption=''}={}){
 const out=[],add=(field,message)=>out.push({field,message});title=String(title);caption=String(caption);
 const cp=s=>Array.from(s).length,gr=s=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s)].length;
 const limit=(field,count,max,unit='ký tự')=>{if(count>max)add(field,`${field==='title'?'Tiêu đề':'Nội dung'} ${count}/${max} ${unit}; cần giảm ${count-max}.`);};
 if(provider==='youtube'){limit('title',cp(title),100);limit('caption',new TextEncoder().encode(caption).length,5000,'byte UTF-8');if(/[<>]/.test(title+caption))add('caption','YouTube không cho phép dấu < hoặc > trong tiêu đề/mô tả.');}
 if(provider==='threads')limit('caption',cp(caption),500);
 if(provider==='instagram')limit('caption',cp(caption),2200);
 if(provider==='tiktok')limit('caption',caption.length,2200,'đơn vị UTF-16');
 if(provider==='mastodon')limit('caption',cp(caption),500);
 if(provider==='bluesky'){limit('caption',gr(caption),300,'cụm ký tự');limit('caption',new TextEncoder().encode(caption).length,3000,'byte UTF-8');}
 if(provider==='reddit')limit('title',cp(title),300);
 // X's current connector uses a conservative UTF-16 bound, not the weighted Twitter counter.
 if(provider==='x')limit('caption',caption.length,280,'đơn vị của cổng X hiện tại');
 if(provider==='devto'&&hashtags(caption).length>4)add('caption','DEV.to chỉ gắn tối đa 4 tag; hãy chọn lại hashtag cho đích này.');
 return out;
}
