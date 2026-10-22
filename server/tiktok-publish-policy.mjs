export const tiktokUnauditedMessage='Ứng dụng TikTok chưa được duyệt đăng công khai. Chế độ Sandbox chỉ cho đăng thử khi tài khoản TikTok ở chế độ riêng tư và video chọn “Chỉ mình tôi”. Giữ tài khoản công khai thì cần hoàn tất xét duyệt Production trước; hệ thống không tự đổi quyền riêng tư.';
export function tiktokPublishBlock(channel,visibility,env=process.env){
 if(channel?.provider==='tiktok'&&channel.mode!=='demo'&&String(env.TIKTOK_CLIENT_KEY||'').startsWith('sb')&&visibility!=='private')return tiktokUnauditedMessage;
 return '';
}
export function tiktokProviderMessage(code){
 if(['unaudited_client_can_only_post_to_private_accounts','unaudited_client_can_only_post_to_private_account'].includes(String(code)))return tiktokUnauditedMessage;
 return '';
}
