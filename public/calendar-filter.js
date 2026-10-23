export const defaultCalendarSelection=['appointment'];
export const calendarTypes={published:'Đã đăng',scheduled:'Lên lịch',failed:'Lỗi',appointment:'Lịch hẹn'};
export function calendarType(item){
 if(item.type==='call')return 'appointment';
 const status=item.status||item.state;
 if(['published','manually_confirmed'].includes(status))return 'published';
 if(['failed','blocked','unknown'].includes(status))return 'failed';
 if(['scheduled','preparing','ready','publishing','dispatching','processing','awaiting_manual','accepted'].includes(status))return 'scheduled';
 return null;
}
export const calendarMatches=(item,selected)=>selected.includes(calendarType(item));
export const calendarChannelMatches=(ids,selected)=>selected===null||ids.some(id=>selected.includes(id));
export function ownCalendarAppointment(reminder,userId){
 const ids=reminder.assigneeIds?.length?reminder.assigneeIds:reminder.assignee?[reminder.assignee]:[reminder.actor];
 return ids.includes(userId);
}
