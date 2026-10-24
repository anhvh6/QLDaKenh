// One request lane for polling and explicit opens. Read acknowledgements cannot
// be undone by an older notification or page snapshot arriving later.
export function createNotificationFeed({getState,api,changed}){
 let user='',revision='',pending,reading,lastSync=0,epoch=0,cached=[];
 const readIds=new Map();
 function request(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);return api(path,{...options,signal:controller.signal}).catch(err=>{if(controller.signal.aborted)throw Error('Tải thông báo quá lâu. Vui lòng thử lại.');throw err;}).finally(()=>clearTimeout(timer));}
 function reconcile(rows=[]){const id=getState()?.user?.id;if(id!==user){user=id;revision='';lastSync=0;epoch++;pending=null;reading=null;cached=[];readIds.clear();}if(!rows.length&&cached.length)rows=cached;return rows.map(n=>{const version=readIds.get(n.id);if(version!==undefined&&Number(n.version||0)>version+1)readIds.delete(n.id);return readIds.has(n.id)&&!n.read?{...n,read:true}:n;});}
 function apply(rows){const state=getState();if(!state)return;cached=rows;state.notifications=reconcile(rows);changed(state.notifications);}
 function sync({force=false}={}){
  reconcile();if(reading)return reading;if(pending)return pending;if(!force&&Date.now()-lastSync<5000)return Promise.resolve();
  const id=user,started=epoch;
  const operation=request('/notifications?since='+encodeURIComponent(revision)).then(result=>{if(getState()?.user?.id!==id||epoch!==started)return;revision=result.revision||'';lastSync=Date.now();if(!result.unchanged)apply(Array.isArray(result)?result:result.rows||[]);else apply(cached);});
  const flight=operation.finally(()=>{if(pending===flight)pending=null;});pending=flight;return flight;
 }
 function markRead(){
  reconcile();if(reading)return reading;const id=user,ids=(getState()?.notifications||[]).filter(n=>!n.read).map(n=>n.id);if(!ids.length)return Promise.resolve();
  epoch++;for(const id of ids)readIds.set(id,Number(getState().notifications.find(n=>n.id===id)?.version||0));apply(getState().notifications);
  const operation=request('/notifications/read',{method:'POST',body:{ids}}).then(()=>{if(getState()?.user?.id!==id)return;revision='';lastSync=0;}).catch(err=>{if(getState()?.user?.id===id){for(const id of ids)readIds.delete(id);apply(getState().notifications.map(n=>ids.includes(n.id)?{...n,read:false}:n));}throw err;});
  const flight=operation.finally(()=>{if(reading===flight)reading=null;});reading=flight;return flight;
 }
 return {reconcile,sync,markRead};
}
