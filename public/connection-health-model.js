export function connectionState(c,at=Date.now()){
 const labels={auth_required:['Cần kết nối lại','failed'],permission_required:['Thiếu quyền API','blocked'],rate_limited:['Đang giới hạn API','blocked'],temporary_error:['Lỗi kết nối tạm thời','blocked'],error:['Kiểm tra API thất bại','failed']};
 const check=c.connectionCheck;
 if(check&&check.status!=='ok')return {label:(labels[check.status]||labels.error)[0],tone:(labels[check.status]||labels.error)[1],check};
 const publishing=c.publishingCheck;
 if(publishing&&publishing.status!=='ok'&&Date.parse(publishing.checkedAt)>=Date.parse(check?.checkedAt||0))return {label:publishing.status==='auth_required'?'Cần kết nối lại':'Đăng bài cần xử lý',tone:'blocked',check:publishing};
 if(c.health?.checks?.some(x=>x.status==='error'))return {label:'Một số chức năng bị lỗi',tone:'blocked',check};
 if(check?.status==='ok'&&at-Date.parse(check.checkedAt)<86400000)return {label:'API hoạt động',tone:'connected',check};
 return {label:'Chưa kiểm tra gần đây',tone:'pending',check};
}
