export function privateChatWaitMessage(conversation){
 if(!conversation?.privateReplyCommentId||conversation.lastInboundAt||!conversation.privateReplySentAt)return '';
 return 'Tin riêng đầu tiên đã được nền tảng xác nhận. Cần chờ khách trả lời tin riêng trước khi gửi tiếp.';
}
