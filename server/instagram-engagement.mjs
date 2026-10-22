// Facebook Login's Instagram likes endpoint requires a Facebook User token,
// not the Page token used for publishing, comments and messaging.
export async function instagramCommentLike(c, commentId, like, credentials, request) {
 if (!credentials.userToken) throw Error('Cần kết nối lại Instagram và cấp quyền Like (instagram_manage_engagement).');
 const result=await request(`https://graph.facebook.com/v26.0/${encodeURIComponent(c.accountId)}/likes?${new URLSearchParams({comment_id:String(commentId)})}`,{method:like?'POST':'DELETE',headers:{Authorization:'Bearer '+credentials.userToken}});
 if(result?.success!==true)throw Object.assign(Error('Instagram chưa xác nhận thay đổi Like. Kiểm tra bình luận gốc trước khi thử lại.'),{unknown:true});
 return result;
}
