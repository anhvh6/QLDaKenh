import React from 'react';
import {createRoot} from 'react-dom/client';
import {ClientView} from '../pages/ClientView';
import './style.css';
const id=new URLSearchParams(location.search).get('customer')||'';
createRoot(document.getElementById('root')!).render(<ClientView customerId={id} token="staff-preview" isAdmin={true} adminRole="staff" checkPermission={()=>false}/>);
