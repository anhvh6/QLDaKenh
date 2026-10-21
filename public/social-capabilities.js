// Implemented connector operations, not a claim that the current token grants them.
export const socialOperations={
 facebook:{publish:true,chat:true,comments:true,reply:true,like:true},
 instagram:{publish:true,chat:true,comments:true,reply:true},
 threads:{publish:true,comments:true,reply:true},
 youtube:{publish:true,comments:true,reply:true},
 x:{publish:true,comments:true,reply:true},
 blogger:{publish:true,comments:true},devto:{publish:true,comments:true},
 mastodon:{publish:true,comments:true,reply:true,like:true},
 bluesky:{publish:true,comments:true,reply:true,like:true,share:true},
 tumblr:{publish:true},reddit:{publish:true},
 zalo:{chat:true},zalo_personal:{chat:true}
};
export function socialCan(provider,operation){return socialOperations[provider]?.[operation]===true;}
export const socialOperationLabels={publish:'Đăng bài',chat:'Chat',comments:'Đọc bình luận',reply:'Trả lời',like:'Like',share:'Chia sẻ'};
