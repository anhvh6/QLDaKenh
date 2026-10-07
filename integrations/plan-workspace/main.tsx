import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanEditor} from '../pages/PlanEditor';
import {initialize,saveCustomer,call,handoffId} from './localServices';
import './style.css';

function Preview({data,onEdit}:{data:any,onEdit:()=>void}){const c=data.customer;return <main className="plan-preview"><div className="flex gap-3 mb-6"><button onClick={onEdit} className="bridge-button">Chỉnh sửa phác đồ</button><button onClick={()=>window.print()} className="bridge-button">In bản xem nội bộ</button></div><h1>{c.customer_name}</h1><p>{c.customer_id} · {c.start_date} → {c.end_date} · {c.duration_days} ngày</p><div className="bridge-note">Bản xem dành cho nhân viên tại localhost. Chưa phát hành link học viên trên hệ thống đang chạy.</div><h2>{c.app_title}</h2><p>{c.app_slogan}</p>{c.note&&<p className="whitespace-pre-wrap">{c.note}</p>}<div className="preview-tasks">{data.tasks.map((t:any,i:number)=><article key={t.id||i}><span>Ngày {t.day} · {t.type}</span><h3>{t.title}</h3><p>{t.detail}</p>{t.link&&<a href={t.link} target="_blank" rel="noopener noreferrer">Mở tài liệu bài tập ↗</a>}</article>)}</div></main>;}
function App(){const [data,setData]=useState<any>(null),[error,setError]=useState(''),[preview,setPreview]=useState<any>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{initialize().then(setData).catch(e=>setError(e.message));},[]);
 if(error)return <div className="bridge-error"><h1>Chưa mở được phác đồ</h1><p>{error}</p><button onClick={()=>location.reload()}>Tải lại</button></div>;
 if(!data)return <p className="p-8">Đang tải hồ sơ học viên…</p>;
 const navigate=async(page:string)=>{if(page==='preview'){try{setPreview(await call('preview'));}catch(e:any){setError(e.message);}}else if(page==='plan-editor'){setPreview(null);setRevision(r=>r+1);}else window.parent.postMessage({type:'taophacdo:return',handoffId},location.origin);};
 return <div onChangeCapture={()=>window.parent.postMessage({type:"taophacdo:dirty",handoffId},location.origin)}><div className="bridge-ribbon"><strong>{data.mode==='chat_profile'?'Phác đồ từ hồ sơ khách hàng':'✓ Đã xác nhận nhận tiền · '+data.order.code}</strong><span>{data.mode==='chat_profile'?'Có thể tạo và lưu phác đồ; thanh toán quản lý riêng tại Đơn hàng.':Number(data.order.paid).toLocaleString('vi-VN')+' ₫ · Phác đồ gắn với đúng học viên của đơn'}</span><small>Trình PlanEditor tái sử dụng từ taophacdoT4 · Lưu vào workspace, chưa ghi production</small></div>{preview?<Preview data={preview} onEdit={()=>{setPreview(null);setRevision(r=>r+1);}}/>:<><p className="bridge-note" hidden={!data.catalogWarning}>{data.catalogWarning}</p><PlanEditor key={revision} onNavigate={navigate} customerId={data.version?data.customer.customer_id:undefined} draftCustomer={data.version?undefined:data.customer} products={data.products} onUpsert={saveCustomer} onDelete={async()=>{throw new Error('Không xóa học viên gốc ở chế độ hợp nhất luồng.');}} currentUserRole="staff" checkPermission={(p:string)=>!['manage_security','delete_student'].includes(p)}/></>}</div>;
}
createRoot(document.getElementById('root')!).render(<App/>);

