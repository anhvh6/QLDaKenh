import {accessFor} from './access-control.mjs';
import {get} from './store.mjs';
import {notificationCategory} from '../public/notification-permissions.js';
export function allowsNotification(user,kind,row,conversation,rights=accessFor(user)){
 const c=conversation||(row.conversationId?get('conversations',row.conversationId):null),message=kind==='notifications'&&row.messageId?get('messages',row.messageId):null;
 const key=notificationCategory(kind,row,c)||message&&notificationCategory('messages',message,c);
 if(key&&rights[key]===false)return false;
 if(c&&rights[c.kind==='comment'?'menu.comments':'menu.inbox']===false)return false;
 return true;
}
