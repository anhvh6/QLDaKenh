import React,{useEffect} from 'react';
function UnifiedAccounts(){useEffect(()=>{window.parent.postMessage({type:'workspace:access'},location.origin);},[]);return <p>Đang mở Quyền/ tài khoản trong Cài đặt…</p>;}
export const PermissionsManagement=UnifiedAccounts;
export const AdminUsersManagement=UnifiedAccounts;
