export const calendarTypes={published:'Đã đăng',scheduled:'Lên lịch',failed:'Lỗi',appointment:'Lịch hẹn'};
export function calendarType(item){
 const status=item.status||item.state;
 if(['published','manually_confirmed'].includes(status))return 'published';
 if(['failed','blocked','unknown'].includes(status))return 'failed';
 if(['scheduled','preparing','ready','publishing','dispatching','processing','awaiting_manual','accepted'].includes(status))return 'scheduled';
 return null;
}
export const calendarMatches=(item,selected)=>selected.includes(calendarType(item));
