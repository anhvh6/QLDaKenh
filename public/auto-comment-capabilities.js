export const autoCommentCapabilities={
 facebook:{label:'Facebook',text:true,image:true,max:10000},instagram:{label:'Instagram',text:true,image:false,max:2200},threads:{label:'Threads',text:true,image:true,max:500},youtube:{label:'YouTube',text:true,image:false,max:10000},x:{label:'X',text:true,image:false,max:280},mastodon:{label:'Mastodon',text:true,image:true,max:500},bluesky:{label:'Bluesky',text:true,image:true,max:300,imageBytes:1000000},reddit:{label:'Reddit',text:true,image:false,max:10000},
 tumblr:{label:'Tumblr',text:false,image:false,reason:'chưa hỗ trợ tự động comment: API công khai hiện chưa có chức năng tạo reply/comment.'},blogger:{label:'Blogger',text:false,image:false,reason:'chưa hỗ trợ tạo bình luận qua Blogger API.'},devto:{label:'DEV.to',text:false,image:false,reason:'chưa có API công khai tạo bình luận phù hợp.'},tiktok:{label:'TikTok',text:false,image:false,reason:'Content Posting API không bao gồm quyền tạo bình luận; cần tích hợp API bình luận riêng được cấp quyền.'}
};
export function autoCommentIssue(channel,{text='',assetIds=[]}={}){const cap=autoCommentCapabilities[channel?.provider],label=channel?.name||cap?.label||channel?.provider||'Kênh';if(!cap?.text)return label+': '+(cap?.reason||'chưa hỗ trợ tự động comment qua API của hệ thống.');if(channel.mode!=='api')return label+': cần kết nối API thực tế để tự động comment.';if(assetIds.length&&!cap.image)return label+': tự động comment chỉ hỗ trợ văn bản; bỏ ảnh hoặc bỏ kênh này.';const count=channel.provider==='bluesky'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length:Array.from(text).length;if(count>cap.max)return label+': bình luận vượt '+cap.max+' ký tự.';return '';}

// Keep the requested configuration intact; derive the safe payload separately per destination.
export function commentForChannel(value,channel,assets=[]){
 const config={enabled:!!value?.enabled,text:String(value?.text||''),assetIds:[...(value?.assetIds||[])]};if(!config.enabled)return {config,warnings:[]};
 const cap=autoCommentCapabilities[channel?.provider],label=channel?.name||cap?.label||channel?.provider||'Kênh',warnings=[];
 if(!cap?.text||channel?.mode!=='api')return {config:{enabled:false,text:'',assetIds:[]},warnings:[label+': không tự comment vì '+(cap?.reason||'chưa hỗ trợ kết nối API phù hợp.') ]};
 if(config.assetIds.length&&!cap.image){warnings.push(label+': không hỗ trợ ảnh bình luận; chỉ gửi nội dung chữ.');config.assetIds=[];}
 if(cap.imageBytes&&config.assetIds.some(id=>assets.find(a=>a.id===id)?.size>cap.imageBytes)){warnings.push(label+': ảnh vượt 1 MB; chỉ gửi nội dung chữ.');config.assetIds=[];}
 const textIssue=autoCommentIssue(channel,{text:config.text,assetIds:[]});if(textIssue){warnings.push(textIssue+' Không tự comment trên kênh này; bài viết vẫn được đăng.');config.enabled=false;}
 if(!config.text.trim()&&!config.assetIds.length){warnings.push(label+': không còn nội dung bình luận phù hợp, bỏ qua tự comment.');config.enabled=false;}
 return {config,warnings};
}
