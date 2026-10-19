import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cleanOrderWorkspace,filterOrderRows} from '../public/order-workspace-model.js';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'order-workspace-'));
const {put}=await import('../server/store.mjs');const {saveOrderWorkspace,orderWorkspaceState,orderPOSFields}=await import('../server/order-workspace.mjs');
test('view filters combine multi-values, Vietnamese search, date timezone and numeric boundaries',()=>{
 const rows=[{code:'A',customerName:'Đỗ Hoàng',displayStatus:'packing',warehouseId:'w',total:100,createdAt:'2026-10-15T18:30:00Z',tags:['VIP'],online:true,paymentStatus:'unpaid'},{code:'B',displayStatus:'draft',warehouseId:'x',total:null,createdAt:'bad'}];
 const f={search:'do hoang',statuses:['packing','confirmed'],warehouses:['w'],tags:['VIP'],from:'2026-10-16',to:'2026-10-16',minTotal:'100',maxTotal:'100'};
 assert.deepEqual(filterOrderRows(rows,f).map(r=>r.code),['A']);assert.equal(filterOrderRows(rows,{...f,to:'2026-10-15'}).length,0);assert.equal(filterOrderRows(rows,{minTotal:'0'}).length,1);assert.equal(filterOrderRows(rows,{from:'2026-10-16'}).length,1);
});
test('built-in attention/late views exclude completed orders and unknown deadline',()=>{
 const rows=[{code:'late',displayStatus:'pickup_pending',handoverAt:'2020-01-01'},{code:'done',displayStatus:'delivered',handoverAt:'2020-01-01'},{code:'failed',displayStatus:'failed'},{code:'delivery-late',displayStatus:'in_transit',expectedDelivery:'2020-01-02'},{code:'already-sent',displayStatus:'shipping',handoverAt:'2020-01-01'}];
 assert.deepEqual(filterOrderRows(rows,{},'late').map(r=>r.code),['late','delivery-late']);assert.deepEqual(filterOrderRows(rows,{},'attention').map(r=>r.code),['failed']);
});
test('workspace sanitizes columns, per-user views and conflicting saves',()=>{
 const a={id:'a',role:'owner'},b={id:'b',role:'viewer'};let p=orderWorkspaceState(a);assert.equal(p.version,0);
 p=saveOrderWorkspace(a,{version:0,columns:['phone','code','phone','invalid'],views:[{id:'view-test',name:' Chờ giao ',filters:{statuses:['pickup_pending'],unknown:'bad'}}],pageSize:10});assert.deepEqual(p.columns,['phone','code']);assert.equal(p.views[0].name,'Chờ giao');assert.equal(orderWorkspaceState(b).views.length,0);assert.throws(()=>saveOrderWorkspace(a,{version:0}),/đã thay đổi/);assert.equal(orderWorkspaceState(a).pageSize,10);assert.ok(!JSON.stringify(p).includes('unknown'));assert.ok(cleanOrderWorkspace({columns:[]}).columns.length>0);
});
test('POS projection preserves sync display fields without raw credentials or creator contacts',()=>{
 put('pos_accounts',{id:'a',shopId:'123',shopName:'Shop QA',warehouseName:'Kho QA'});put('pos_links',{id:'l',kind:'orders',accountId:'a',localId:'o',remoteId:'r',remote:{status:8,status_name:'Đang đóng hàng',creator:{id:'u',name:'NV QA',phone:'private'},tags:[{name:'VIP'}],note_print:'In thử',privateToken:'secret',shipping_address:{address:'Không được lộ raw'}}});
 const [row]=orderPOSFields([{id:'o',code:'QA'}]);assert.equal(row.posDisplay.status,8);assert.equal(row.posDisplay.creatorName,'NV QA');assert.deepEqual(row.posDisplay.tags,['VIP']);assert.equal(row.posDisplay.printNote,'In thử');assert.ok(!JSON.stringify(row).includes('private'));assert.ok(!JSON.stringify(row).includes('secret'));assert.ok(row.posDisplay.orderLink.startsWith('https://pos.pancake.vn/shop/123/'));
});

test('column widths and hidden default tabs persist per account with bounds',()=>{
 const user={id:'width-user',role:'owner'};
 const saved=saveOrderWorkspace(user,{version:0,columnWidths:{code:400,phone:1,address:5000,invalid:100},hiddenViews:['attention','late','invalid']});
 assert.deepEqual(saved.columnWidths,{code:400,phone:64,address:1000});assert.deepEqual(saved.hiddenViews,['attention','late']);
 assert.deepEqual(orderWorkspaceState(user).columnWidths,saved.columnWidths);assert.deepEqual(orderWorkspaceState({id:'other-user'}).hiddenViews,[]);
 assert.deepEqual(orderWorkspaceState({id:'other-user'}).columnWidths,{});
});
test('saved workflow tabs retain their predicate and old counter filters no longer hide online orders',()=>{
 const rows=[{code:'A',displayStatus:'pickup_pending',online:true},{code:'B',displayStatus:'delivered',online:false}];
 assert.deepEqual(filterOrderRows(rows,{workflow:'waiting'}).map(r=>r.code),['A']);
 assert.equal(filterOrderRows(rows,{source:'counter'}).length,2);
});
