export function reactionEmoji(value){
 const text=String(value||'').trim();
 if(/^(?:[❤♥]\ufe0e?\ufe0f?|heart|love)$/i.test(text))return '❤️';
 return text;
}
