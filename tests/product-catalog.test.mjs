import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {planProducts,resolveCatalogProduct} from '../server/product-catalog.mjs';

test('catalog preserves stable identity and distinguishes inventory from course availability',()=>{
 const rows=[{id:'one',sku:'SKU',name:'Dụng cụ',price:260000,stock:10,reserved:3},{id:'two',sku:'C',name:'Khóa học',productType:'course',stock:0},{id:'old',active:false}];
 assert.equal(planProducts(rows).length,2);assert.equal(planProducts(rows)[0].availableStock,7);assert.equal(planProducts(rows)[1].availableStock,null);
 assert.equal(resolveCatalogProduct(rows,'catalog:SKU').id,'one');assert.equal(resolveCatalogProduct(rows,'catalog:missing'),null);
 assert.equal(resolveCatalogProduct([...rows,{id:'duplicate',sku:'SKU'}],'catalog:SKU'),null);
});
test('products, legacy management, plan editor, learner and quick orders use one catalog',async t=>{
 mkdirSync('test-data',{recursive:true});const dir=mkdtempSync(join(resolve('test-data'),'catalog-')),base='http://127.0.0.1:4493';let cookie='',csrf='';
 const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'4493',DATA_DIR:dir,PLAN_REMOTE_CATALOG:'0'},stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 for(let i=0;i<160;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const req=async(path,method='GET',body,status=200)=>{const r=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return data;};
 await req('/setup','POST',{name:'Owner',email:'catalog@example.test',password:'CatalogTest2026!',demo:true});
 const p=await req('/records/products','POST',{name:'Khóa học mới',sku:'CAT-QA',price:260000,cost:120000,productType:'course'}),c=await req('/records/customers','POST',{name:'Catalog student',phone:'0901112222'}),learner='/care/customers/'+c.id+'/learner',editor='/plans/'+encodeURIComponent('draft:'+c.id)+'/editor';
 const readAll=async()=>{
  const [catalog,legacy,plan,profile,quick]=await Promise.all([req('/product-catalog'),req('/proxy/supabase/rest/v1/products?select=*&order=ten_sp.asc'),req(editor),req(learner),req(learner+'/order')]);
  for(const list of [catalog,legacy,plan.products]){const row=list.find(x=>x.productId===p.id);assert.equal(row.ten_sp,'Khóa học mới');assert.equal(row.gia_ban,260000);assert.equal(row.id_sp,'CAT-QA');}
  for(const list of [profile.products,quick.products]){assert.equal(list.find(x=>x.id===p.id).price,260000);assert.ok(!list.some(x=>x.id.startsWith('catalog:')));}
 };
 await readAll();
 const order=await req(learner+'/order','POST',{customerVersion:c.version,items:[{productId:'catalog:CAT-QA',quantity:1,price:260000}]});assert.equal(order.items[0].productId,p.id);
 const next=await req('/records/products/'+p.id,'PATCH',{...p,name:'Tên mới từ Sản phẩm',price:330000,version:p.version});
 const [catalog,plan,quick,state]=await Promise.all([req('/product-catalog'),req(editor),req(learner+'/order'),req('/state')]);
 assert.equal(catalog.find(x=>x.productId===p.id).ten_sp,next.name);assert.equal(plan.products.find(x=>x.productId===p.id).gia_ban,330000);assert.equal(quick.products.find(x=>x.id===p.id).price,330000);
 assert.equal(state.orders.find(x=>x.id===order.id).items[0].price,260000);assert.equal(state.orders.find(x=>x.id===order.id).items[0].name,'Khóa học mới');
 await req('/proxy/supabase/rest/v1/products','POST',[{id_sp:'STALE',ten_sp:'Old catalog'}],409);
 await req('/records/products/'+p.id,'PATCH',{...next,active:false,version:next.version});
 assert.ok(!(await req(editor)).products.some(x=>x.productId===p.id));assert.ok(!(await req(learner+'/order')).products.some(x=>x.id===p.id));
 const customer=(await req(learner+'/order')).customer;
 await req(learner+'/order','POST',{customerVersion:customer.version,items:[{productId:'catalog:STALE',quantity:1,price:1}]},400);
 assert.ok(!(await req('/state')).products.some(x=>x.id==='plan-product:STALE'));
});
