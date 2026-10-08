import React from 'react';
import {createRoot} from 'react-dom/client';
import {ClientView} from '../pages/ClientView';
import {loadPreview} from './services';
import './style.css';
const root=createRoot(document.getElementById('root')!);
const onNavigate=(page:string,params?:{customerId?:string;templateId?:string})=>parent.postMessage({type:'chat:plan-preview-navigate',page,params},location.origin);
root.render(<p role="status">Đang tải phác đồ học viên…</p>);
loadPreview().then(({customer})=>{
  let token='staff-preview';
  try{token=new URL(customer.link).searchParams.get('t')||token;}catch{}
  root.render(<ClientView customerId={customer.customer_id} token={token} onNavigate={onNavigate} isAdmin={true} adminRole="staff" checkPermission={permission=>permission==='view_video'}/>);
}).catch(error=>root.render(<p role="alert">{error.message}</p>));
