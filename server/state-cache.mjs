// Share only identical, authorized snapshots for a short burst of requests.
export class StateCache{
 constructor({ttl=15000,limit=20}={}){this.ttl=ttl;this.limit=limit;this.entries=new Map();}
 get(key,revision,time=Date.now()){const value=this.entries.get(key);return value&&value.revision===revision&&time-value.at<this.ttl?value.state:undefined;}
 set(key,revision,state,time=Date.now()){this.entries.delete(key);this.entries.set(key,{revision,state,at:time});while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);return state;}
}
