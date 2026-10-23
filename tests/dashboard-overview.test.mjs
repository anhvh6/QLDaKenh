import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {learnerCycleSummary} from '../public/learner-cycle-model.js';import {cpuPercent,metricLevel,metricLimits,createSystemMonitor} from '../server/system-metrics.mjs';
import {readOverviewSource,metricChart} from '../public/dashboard-overview.js';
test('overview reads the existing management API with projections and complete pagination, without credentials or personal fields',async()=>{
 const calls=[];const out=await readOverviewSource(async path=>{if(path==='/overview/learners')throw Object.assign(new Error('old server'),{status:404});calls.push(path);const u=new URL('http://test'+path);assert.ok(u.pathname.startsWith('/proxy/supabase/rest/v1/'));assert.ok(!/api_key|token|sdt|customer_name|email/.test(u.searchParams.get('select')));if(u.pathname.endsWith('/products'))return [];const count=Number(u.searchParams.get('offset'))===0?500:1;return Array.from({length:count},(_,i)=>({customer_id:String(i),status:'ACTIVE',created_at:'2020-01-01'}));});assert.equal(out.stats.total,501);assert.equal(calls.filter(p=>p.includes('/customers?')).length,2);
 await assert.rejects(readOverviewSource(async()=>({error:'unavailable'})),/hợp lệ/);
});
test('learner cycle boundaries use Vietnam time and preserve dashboard groups, daily opens and product costs',()=>{
 const at=Date.parse('2026-10-16T03:00:00Z'),customers=[
 {customer_id:'new',created_at:'2026-10-16T03:00:00Z',video_date:'',gia_tien:100,is_deposit:true,deposit_amount:20,san_pham:[{id_sp:'P',so_luong:2,don_gia:50}],raw_backup:{video_open_dates:['2026-10-16']}},
 {created_at:'2026-09-01',start_date:'2026-10-01',end_date:'2026-11-01',video_date:'2026-01-01'},
 {created_at:'2026-09-01',start_date:'2026-10-01',end_date:'2026-10-21',video_date:'2026-01-01'},
 {created_at:'2026-10-15',is_consultation:true},
 {created_at:'2026-10-15',video_date:''},
 {created_at:'2026-10-16',status:'DELETED',gia_tien:1000},
 {created_at:'2026-09-01',video_date:'',raw_backup:JSON.stringify({last_video_open_time:'2026-10-15T18:00:00Z'})}];
 const s=learnerCycleSummary(customers,[{id_sp:'P',gia_nhap:10}],at);assert.equal(s.from,'2026-10-15');assert.equal(s.to,'2026-11-14');assert.deepEqual(s.stats,{new:1,noPlan:1,consultation:1,deposit:1,active:1,expiring:1,total:6,opened:2,profit:100});
 assert.equal(learnerCycleSummary([],[],Date.parse('2026-10-14T03:00Z')).from,'2026-09-15');assert.equal(learnerCycleSummary([],[],Date.parse('2026-12-31T18:00Z')).to,'2027-01-14');
});
test('system thresholds are explicit and unknown values never report healthy',()=>{
 assert.equal(cpuPercent({idle:100,total:200},{idle:150,total:300}),50);assert.equal(cpuPercent({idle:1,total:1},{idle:1,total:1}),null);
 assert.equal(metricLevel(null,metricLimits.cpu),'unknown');assert.equal(metricLevel(69,metricLimits.cpu),'healthy');assert.equal(metricLevel(70,metricLimits.cpu),'warning');assert.equal(metricLevel(90,metricLimits.cpu),'danger');
});
test('system monitor samples real resources, bounds history and counts requests only once on close and finish',async()=>{
 const monitor=createSystemMonitor({directory:process.cwd(),interval:100000,capacity:2});try{await new Promise(r=>setTimeout(r,30));const response=new EventEmitter();response.statusCode=500;monitor.request({url:'/api/test'},response);response.emit('finish');response.emit('close');await monitor.sample();await monitor.sample();const data=monitor.snapshot();assert.ok(data.history.length<=2);assert.equal(data.current.errors,100);assert.equal(data.current.active,0);assert.ok(data.current.memory>=0&&data.current.memory<=100);assert.ok(data.current.disk>=0&&data.current.disk<=100);assert.ok(data.current.latency>=0);}finally{monitor.close();}
});
test('long-lived notification streams cannot inflate p95; real slow responses remain visible and expire after a minute',async()=>{
 let time=1000000,tick=0;const reports=[],monitor=createSystemMonitor({directory:process.cwd(),interval:100000,now:()=>time,monotonic:()=>tick,onSlowSample:r=>reports.push(r)});
 try{await new Promise(r=>setTimeout(r,30));
  const response=new EventEmitter();response.statusCode=200;response.writableFinished=true;
  monitor.request({url:'/api/events?token=DO-NOT-LOG'},response);tick=3600000;response.emit('finish');response.emit('close');
  const fast=new EventEmitter();fast.statusCode=200;fast.writableFinished=true;monitor.request({url:'/api/state'},fast);tick+=12;fast.emit('finish');fast.emit('close');
  await monitor.sample();assert.equal(monitor.snapshot().current.latency,12);assert.equal(monitor.snapshot().current.requestCount,1);assert.equal(monitor.snapshot().current.active,0);
  const slow=new EventEmitter();slow.statusCode=200;slow.writableFinished=true;monitor.request({url:'/api/proxy/supabase/rest/v1/customers?token=DO-NOT-LOG'},slow);tick+=1974.6;slow.emit('finish');
  await monitor.sample();let current=monitor.snapshot().current;assert.ok(Math.abs(current.latency-1974.6)<.001);assert.equal(current.slowGroups[0].name,'Kết nối QL Phác đồ');assert.equal(reports.length,1);assert.ok(!JSON.stringify(reports).includes('DO-NOT-LOG'));
  await monitor.sample();assert.equal(reports.length,1);time+=61000;await monitor.sample();current=monitor.snapshot().current;assert.equal(current.latency,null);assert.deepEqual(current.slowGroups,[]);
 }finally{monitor.close();}
});
test('HTTP chart keeps threshold labels separate even after a very large outlier',()=>{
 const html=metricChart('latency',{history:[{latency:3600000},{latency:1974.6}],current:{latency:1974.6}},metricLimits.latency);
 assert.ok(html.includes('Phản hồi chậm'));assert.ok(html.includes('Cảnh báo ≥ 500 ms'));assert.ok(html.includes('Mức cao ≥ 1500 ms'));assert.ok(!html.includes('<text'));
});

test('overview reads one materialized result, with no source pagination on a current server',async()=>{const calls=[];const data=await readOverviewSource(async path=>{calls.push(path);return {stats:{total:9000},from:'2026-10-15',to:'2026-11-14',updatedAt:123,stale:true};});assert.deepEqual(calls,['/overview/learners']);assert.equal(data.stats.total,9000);assert.equal(data.stale,true);await assert.rejects(readOverviewSource(async()=>{throw Object.assign(new Error('warming'),{status:503});}),/warming/);});
