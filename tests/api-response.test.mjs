import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJSON} from '../public/api-response.js';
test('gateway HTML errors return a useful error and retain HTTP status',async()=>{
 await assert.rejects(requestJSON('/api/state',{},async()=>new Response('<html>Bad Gateway</html>',{status:502})),err=>err.status===502&&/Máy chủ/.test(err.message));
});
test('authentication errors preserve status and successful state is returned',async()=>{
 await assert.rejects(requestJSON('/api/state',{},async()=>Response.json({error:'Phiên đăng nhập hết hạn'},{status:401})),err=>err.status===401&&/Phiên/.test(err.message));
 assert.deepEqual(await requestJSON('/api/state',{},async()=>Response.json({customers:[],conversations:[]})),{customers:[],conversations:[]});
});
test('pending state requests time out instead of waiting indefinitely',async()=>{
 const keepAlive=setTimeout(()=>{},100);
 try{await assert.rejects(requestJSON('/api/state',{},async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),10),/Tải dữ liệu quá lâu/);}finally{clearTimeout(keepAlive);}
});
