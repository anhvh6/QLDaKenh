export function reconcileMentions(oldText,text,mentions=[]){
 let start=0;while(start<oldText.length&&start<text.length&&oldText[start]===text[start])start++;
 let end=oldText.length,nextEnd=text.length;while(end>start&&nextEnd>start&&oldText[end-1]===text[nextEnd-1]){end--;nextEnd--;}
 const delta=nextEnd-end;return mentions.flatMap(m=>{if(end<=m.pos)return [{...m,pos:m.pos+delta}];if(start>=m.pos+m.len)return [m];return [];}).filter(m=>text.slice(m.pos,m.pos+m.len)===m.text);
}
