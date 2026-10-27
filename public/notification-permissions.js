export function notificationCategory(kind,row,conversation){
 if(row.notificationType)return 'notify.'+row.notificationType;
 if(kind==='messages'){if(row.direction==='incoming')return 'notify.'+(conversation?.kind==='comment'?'comment_new':'chat_new');if(row.direction==='outgoing')return row.botId||row.senderType==='ai'?'notify.ai_sent':row.communicationCampaignId||row.automatic?'notify.automatic_sent':null;}
 const title=row.title||'';if(/^Bình luận mới/.test(title))return 'notify.comment_new';if(/^Tin nhắn mới/.test(title)||row.id?.startsWith('care-message:'))return 'notify.'+(conversation?.kind==='comment'?'comment_new':'chat_new');if(/Cần xử lý bài đăng|Đăng bài.*lỗi/.test(title))return 'notify.post_failed';if(/Đã chuẩn bị bài viết|Đã dùng lại bài/.test(title))return 'notify.post_planned';return null;
}
export function recordNotification(kind,row,previous,time=Date.now()){
 if(row.history===true)return null;
 if(!previous&&Date.parse(row.createdAt)<time-3600000)return null;
 let type,title,route,body,extra={};
 if(kind==='publications'&&row.status!==previous?.status){type=row.status==='published'?'post_published':['failed','unknown','blocked'].includes(row.status)?'post_failed':row.status==='scheduled'?'post_planned':null;title={post_published:'Đăng bài thành công',post_failed:'Đăng bài lỗi',post_planned:'Dự thảo đã vào kế hoạch'}[type];route='content';body=row.error||row.title||'';extra={publicationId:row.id,contentId:row.contentId,connectionId:row.connectionId};}
 if(kind==='copy_plan_items'&&!previous&&row.state==='pending'){type='post_planned';title='Dự thảo đã vào kế hoạch';body='Đã thêm video vào kế hoạch đăng bài.';route='content';extra={recipientId:row.userId,planId:row.planId};}
 if(kind==='messages'&&row.direction==='outgoing'&&['accepted','sent'].includes(row.status)&&!['accepted','sent'].includes(previous?.status)){type=row.botId||row.senderType==='ai'?'ai_sent':row.communicationCampaignId||row.automatic?'automatic_sent':null;title=type==='ai_sent'?'Bot AI đã gửi tin nhắn':'Đã gửi tin nhắn tự động';route='inbox';body=row.text||'Đã gửi tệp đính kèm';extra={conversationId:row.conversationId,messageId:row.id};}
 return type?{id:'access-event:'+kind+':'+row.id+':'+type,title,body:String(body).slice(0,350),route,notificationType:type,read:false,...extra}:null;
}
