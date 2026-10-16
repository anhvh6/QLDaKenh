// Explicit integration check: creates one uniquely marked QA learner and removes only that row.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveLearnerRegistration,readLearner} from '../server/supabase.mjs';
import {getSupabaseHeaders,SUPABASE_URL} from '../server/store.mjs';
if(!process.argv.includes('--live-roundtrip'))throw Error('Pass --live-roundtrip to run the isolated Supabase check.');
const id='C-QA-REG-'+randomUUID(),marker='qa-registration:'+id;
const registration={customer_name:'QA kiểm thử lưu học viên (tự xóa)',sdt:'',email:'',dia_chi:'',note:'Isolated integration test',start_date:'2026-10-16',end_date:'2026-12-20',duration_days:65,ma_vd:'',trang_thai:0,is_consultation:true,is_deposit:true,deposit_amount:500000,san_pham:[],gia_tien:0};
try{
 const deposited=await saveLearnerRegistration(id,registration,{customerId:marker});
 assert.equal(deposited.is_deposit,true);assert.equal(deposited.deposit_amount,500000);
 const read=await readLearner(id);assert.equal(read.customer_name,registration.customer_name);
 const paid=await saveLearnerRegistration(id,{...registration,is_deposit:false,gia_tien:2099000,san_pham:[{id_sp:'QA-COURSE',ten_sp:'Khóa học QA',so_luong:1,don_gia:2099000,thanh_tien:2099000}]},{expectedUpdatedAt:read.updated_at,customerId:marker});
 assert.equal(paid.is_deposit,false);assert.equal(paid.gia_tien,2099000);assert.equal(paid.customer_id,deposited.customer_id);
 assert.equal(paid.video_date,null);assert.equal(paid.is_customized,false);
 console.log('PASS: shared learner create, read, deposit → paid update; identity and no-plan state preserved.');
}finally{
 const headers=await getSupabaseHeaders(),path=SUPABASE_URL+'/rest/v1/customers?customer_id=eq.'+encodeURIComponent(id);
 const response=await fetch(path+'&select=customer_id,raw_backup',{headers});assert.ok(response.ok);
 const rows=await response.json();assert.ok(rows.length<=1);
 if(rows.length){assert.equal(rows[0].raw_backup?.social_customer_id,marker);const removed=await fetch(path,{method:'DELETE',headers});assert.ok(removed.ok,'QA cleanup failed');}
 assert.equal(await readLearner(id),null);console.log('PASS: only the marked QA learner was removed.');
}
