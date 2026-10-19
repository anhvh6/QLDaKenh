export function calendarEventState(item,appointment=false,time=Date.now()){
 const status=item.status||item.state;
 if(['done','completed','resolved','published','manually_confirmed'].includes(status))return 'completed';
 if(['failed','blocked','unknown'].includes(status))return 'failed';
 return Date.parse(appointment?item.dueAt||item.at:item.scheduleAt||item.at)<=time?'past':'upcoming';
}
export const calendarStateLabels={upcoming:'Sắp diễn ra',past:'Đã đến giờ',completed:'Đã hoàn thành',failed:'Cần xử lý'};
export const calendarEventClass=(item,appointment=false,time=Date.now())=>'schedule-item schedule-'+(appointment?'appointment':'publication')+' schedule-'+calendarEventState(item,appointment,time);
export function calendarStateLabel(item,appointment=false,time=Date.now()){
 const state=calendarEventState(item,appointment,time);
 return state==='completed'&&!appointment?'Đã đăng':state==='past'?appointment?'Đã diễn ra · Chưa hoàn tất':'Đã đến giờ · Chưa đăng':calendarStateLabels[state];
}
export function calendarLegend(){return '<div class="schedule-legend" aria-label="Chú thích màu lịch">'+[['publication','upcoming','Bài đăng · Sắp diễn ra'],['appointment','upcoming','Nhắc hẹn · Sắp diễn ra'],['publication','past','Bài đăng · Đã đến giờ'],['appointment','past','Nhắc hẹn · Đã diễn ra'],['publication','completed','Bài đăng · Đã đăng'],['appointment','completed','Nhắc hẹn · Hoàn thành'],['publication','failed','Đăng lỗi / Cần xử lý']].map(([type,state,label])=>'<span><i class="schedule-item schedule-'+type+' schedule-'+state+'"></i>'+label+'</span>').join('')+'</div>';}
