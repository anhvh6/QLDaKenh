// Current document only: no customer/chat data in localStorage, disk or service worker.
export function pageSnapshotCache({limit=12,ttl=120000,maxBytes=20*1024*1024,now=Date.now}={}){
 const entries=new Map();let bytes=0,generation=0,scope;
 const identity=user=>user?.id&&user.csrf?[user.id,user.role,user.csrf].join(':'):'';
 const key=(view,user)=>identity(user)+':'+view;
 return {get generation(){return generation;},clear(){generation++;entries.clear();bytes=0;scope=undefined;},
  put(state,epoch=generation){if(epoch!==generation||!identity(state?.user)||!state.snapshotView||state.snapshotView==='full'||state.unchanged)return;if(scope&&state.scopeRevision&&scope!==state.scopeRevision){generation++;entries.clear();bytes=0;}scope=state.scopeRevision;const size=JSON.stringify(state).length*2;if(size>maxBytes)return;const id=key(state.snapshotView,state.user),prior=entries.get(id);if(prior){bytes-=prior.size;entries.delete(id);}entries.set(id,{data:structuredClone(state),at:now(),size});bytes+=size;while(entries.size>limit||bytes>maxBytes){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}},
  touch(view,user,revision){const entry=entries.get(key(view,user));if(entry?.data.snapshotRevision===revision)entry.at=now();},
  get(view,user){const id=key(view,user),entry=entries.get(id);if(!entry)return;if(now()-entry.at>=ttl){entries.delete(id);bytes-=entry.size;return;}entries.delete(id);entries.set(id,entry);return structuredClone(entry.data);}
 };
}
