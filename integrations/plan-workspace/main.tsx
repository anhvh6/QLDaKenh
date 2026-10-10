import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanEditor} from '../pages/PlanEditor';
import {initialize,saveCustomer,call,handoffId} from './localServices';
import './style.css';

function Preview(){return <iframe className="shared-plan-preview" src={'/plan-preview/index.html?handoff='+encodeURIComponent(handoffId)} title="Xem phác đồ học viên" allow="clipboard-write" style={{width:'100%',height:'calc(100vh - 30px)',border:0}}/>;}
function App(){const [data,setData]=useState<any>(null),[error,setError]=useState(''),[preview,setPreview]=useState<any>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{initialize().then(setData).catch(e=>setError(e.message));const receive=(event:MessageEvent)=>{const frame=document.querySelector<HTMLIFrameElement>('.shared-plan-preview');if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.type!=='chat:plan-preview-navigate')return;if(event.data.page==='plan-editor'){setPreview(null);setRevision(r=>r+1);}else if(event.data.page==='dashboard')window.parent.postMessage({type:'taophacdo:return',handoffId},location.origin);};window.addEventListener('message',receive);return ()=>window.removeEventListener('message',receive);},[]);
 if(error)return <div className="bridge-error"><h1>Chưa mở được phác đồ</h1><p>{error}</p><button onClick={()=>location.reload()}>Tải lại</button></div>;
 if(!data)return <p className="p-8">Đang tải hồ sơ học viên…</p>;
 const navigate=async(page:string)=>{if(page==='preview'){try{setPreview(await call('preview'));}catch(e:any){setError(e.message);}}else if(page==='plan-editor'){setPreview(null);setRevision(r=>r+1);}else window.parent.postMessage({type:'taophacdo:return',handoffId},location.origin);};
 return <div onChangeCapture={()=>window.parent.postMessage({type:"taophacdo:dirty",handoffId},location.origin)}><div className="bridge-ribbon" style={{display:preview?'none':undefined}}><strong>{data.mode==='chat_profile'?'Phác đồ từ hồ sơ khách hàng':'✓ Đã xác nhận nhận tiền · '+data.order.code}</strong><span>{data.mode==='chat_profile'?'Có thể tạo và lưu phác đồ; thanh toán quản lý riêng tại Đơn hàng.':Number(data.order.paid).toLocaleString('vi-VN')+' ₫ · Phác đồ gắn với đúng học viên của đơn'}</span><small>Lưu vào QL Phác đồ · Dùng chung hồ sơ học viên</small></div>{preview?<Preview/>:<><p className="bridge-note" hidden={!data.catalogWarning}>{data.catalogWarning}</p><PlanEditor key={revision} onNavigate={navigate} customerId={data.version?data.customer.customer_id:undefined} draftCustomer={data.version?undefined:data.customer} products={data.products} onUpsert={async(customer,tasks)=>{const saved=await saveCustomer(customer,tasks);setData({...data,version:saved.planVersion,customer:saved,tasks});return saved;}} onDelete={async()=>{throw new Error('Không xóa học viên gốc ở chế độ hợp nhất luồng.');}} currentUserRole="staff" checkPermission={(p:string)=>!['manage_security','delete_student'].includes(p)}/></>}</div>;
}
createRoot(document.getElementById('root')!).render(<App/>);

