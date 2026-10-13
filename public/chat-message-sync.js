// Keep unchanged rows mounted so updates do not restart videos or reload images.
export function reconcileMessageNodes(container,html){
 const template=document.createElement('template');template.innerHTML=html;
 const existing=new Map([...container.querySelectorAll(':scope > [data-message]')].map(row=>[row.dataset.message,row]));
 const desired=[...template.content.children],wanted=new Set();let cursor=container.firstElementChild;
 for(const next of desired){const previous=next.dataset.message&&existing.get(next.dataset.message);const node=previous&&next.dataset.messageVersion&&previous.dataset.messageVersion===next.dataset.messageVersion?previous:next;
  wanted.add(node);if(node!==cursor)container.insertBefore(node,cursor);else cursor=cursor.nextElementSibling;
 }
 for(const row of [...container.children])if(!wanted.has(row))row.remove();
}
export function chronologicalMessages(messages){return messages.slice().sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||String(a.id).localeCompare(String(b.id)));}
