// Text signals for human review, not a decision that a platform will reject a post.
export const reviewRulesVersion='2026-10-20.1';
export const policyLinks={facebook:'https://transparency.meta.com/policies/community-standards/',instagram:'https://transparency.meta.com/policies/community-standards/',threads:'https://transparency.meta.com/policies/community-standards/',youtube:'https://support.google.com/youtube/answer/2801973',tiktok:'https://www.tiktok.com/community-guidelines',x:'https://help.x.com/en/rules-and-policies/authenticity',blogger:'https://www.blogger.com/content-policy',devto:'https://dev.to/code-of-conduct'};
export function reviewPublishText({provider,title='',caption='',reup=false}){
 const warnings=[],add=(code,field,message,excerpt='')=>warnings.push({code,field,message,excerpt:excerpt.slice(0,160),policyUrl:policyLinks[provider]||''});
 const fields=[['caption',caption],...(['youtube','blogger','devto'].includes(provider)?[['title',title]]:[])];
 for(const [field,raw] of fields){const text=String(raw).normalize('NFC'),signal=(code,pattern,message)=>{const match=text.match(pattern);if(match)add(code,field,message,match[0]);};
  if(field==='title')signal('sensational_title',/sốc tận óc|không xem sẽ hối hận|bấm ngay kẻo bị xóa|bí mật bị che giấu/iu,'Tiêu đề có dấu hiệu giật gân. Đối chiếu với nội dung thực tế của bài / video để tránh tiêu đề gây hiểu nhầm.');
  signal('absolute_claim',/(?:cam kết|đảm bảo|bảo đảm|chữa|điều trị|khỏi|giảm|xóa|xoá|lợi nhuận|thu nhập|guaranteed|cure)[^.!?\n]{0,70}(?:100\s*%|hoàn toàn|tuyệt đối|vĩnh viễn|không rủi ro|chắc chắn|permanent)/iu,'Có dấu hiệu cam kết kết quả tuyệt đối. Kiểm tra căn cứ, ngữ cảnh và điều kiện áp dụng; tránh lời hứa gây hiểu nhầm.');
  signal('engagement_bait',/(?:bắt buộc|phải)[^.!?\n]{0,40}(?:like|share|chia sẻ|tag)|(?:like|share|chia sẻ|tag)[^.!?\n]{0,45}(?:để nhận quà|để trúng|nhận tiền)/iu,'Lời kêu gọi tương tác kèm điều kiện / phần thưởng cần được rà soát để tránh spam hoặc tương tác gây hiểu nhầm.');
  signal('unfinished_text',/\{\{[^{}\n]{1,80}\}\}|\[(?:điền|thêm|nhập)[^\]\n]{0,60}\]|lorem ipsum/iu,'Còn nội dung mẫu hoặc biến chưa điền. Kiểm tra và thay bằng nội dung thật.');
  signal('regulated_goods',/(?:mua|bán|cung cấp)[^.!?\n]{0,25}(?:ma tuý|ma túy|súng đạn|giấy tờ giả|tài khoản ngân hàng)/iu,'Có cụm từ liên quan hàng hóa / dịch vụ bị hạn chế. Kiểm tra ngữ cảnh và chính sách của nền tảng trước khi đăng.');
  const tags=text.match(/#[\p{L}\p{N}_]+/gu)||[],counts=new Map();for(const tag of tags)counts.set(tag.toLocaleLowerCase(),(counts.get(tag.toLocaleLowerCase())||0)+1);const repeated=[...counts].find(([,n])=>n>=3);if(repeated)add('repeated_hashtag',field,'Một hashtag lặp từ 3 lần; cân nhắc bỏ phần lặp để tránh nội dung giống spam.',repeated[0]);
 }
 return warnings;
}
