-- Read-only diagnostics. Run before migration, export results for the integration engineer.
select table_name,column_name,data_type,is_nullable
from information_schema.columns where table_schema='public' and table_name in
('customers','products','courses','payment_orders','admin_users','roles','permissions','role_permissions','master_video_tasks','customer_tasks','attendance_logs')
order by table_name,ordinal_position;
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public';
select tc.table_name,kcu.column_name,ccu.table_name as target_table,ccu.column_name as target_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.constraint_schema=kcu.constraint_schema
join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name and tc.constraint_schema=ccu.constraint_schema
where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public';
select name,display_name from public.roles order by name;
select role_name,permission_code from public.role_permissions order by role_name,permission_code;
