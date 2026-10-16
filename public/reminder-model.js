export const reminderRecipients=r=>[...new Set(r.assigneeIds||[r.assignee].filter(Boolean))];
export const activeAppointmentTask=(task,time=Date.now())=>task.taskType!=='appointment'||Date.parse(task.dueAt)>time;
