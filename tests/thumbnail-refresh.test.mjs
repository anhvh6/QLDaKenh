import test from 'node:test';import assert from 'node:assert/strict';
import {createThumbnailRefresh} from '../public/thumbnail-refresh.js';
function fixture(){let time=1000,id=0,shown=true;const timers=new Map(),rows=[];const refresh=createThumbnailRefresh({now:()=>time,visible:()=>shown,images:key=>rows.filter(i=>i.dataset.videoThumbnail===key),schedule:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},cancel:id=>timers.delete(id)});return {refresh,rows,timers,visible:value=>shown=value,tick(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};}
const image=(key='/api/media/thumbnail/a?v=1&thumbnail=2')=>({dataset:{videoThumbnail:key},naturalWidth:2,naturalHeight:1,isConnected:true,src:key,currentSrc:key});
test('successful SVG placeholders refresh automatically, coalesce duplicate covers and stop when JPEG is ready',()=>{
 const f=fixture(),a=image(),b=image();f.rows.push(a,b);f.refresh.observe(a);f.refresh.observe(b);assert.equal(f.timers.size,1);f.tick(999);assert.ok(!a.src.includes('retry'));f.tick(1);assert.match(a.src,/retry=1$/);assert.equal(a.src,b.src);
 f.refresh.observe(a);assert.equal(f.timers.size,1);a.naturalWidth=270;a.naturalHeight=480;a.currentSrc=a.src;f.refresh.observe(a);assert.equal(f.timers.size,0);f.refresh.observe(b);assert.equal(b.src,a.src);
});
test('hidden/removed images do not poll; exhausted failures and pending jobs have bounded retries',()=>{
 const f=fixture(),a=image();f.rows.push(a);f.visible(false);f.refresh.observe(a);assert.equal(f.timers.size,0);f.visible(true);f.refresh.observe(a);a.isConnected=false;f.tick(1000);assert.ok(!a.src.includes('retry'));
 const g=fixture(),b=image();b.naturalWidth=1;g.rows.push(b);for(let i=0;i<6;i++){g.refresh.observe(b);g.tick(60000);}assert.match(b.src,/retry=2$/);assert.equal(g.timers.size,0);
 const h=fixture(),c=image();h.rows.push(c);for(let i=0;i<20;i++){h.refresh.observe(c);h.tick(15000);}assert.match(c.src,/retry=12$/);assert.equal(h.timers.size,0);
});
