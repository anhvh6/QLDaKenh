-- Additive extension for the documented taophacdo schema.
-- Apply on a BACKUP/STAGING project first. This file is not auto-executed by localhost.
-- Does not alter customers/products/courses/roles, existing RLS or learner access.
begin;
do $$
begin
 if to_regclass('public.customers') is null or to_regclass('public.products') is null
 or to_regclass('public.courses') is null or to_regclass('public.admin_users') is null
 or to_regclass('public.role_permissions') is null then
 raise exception 'Run preflight.sql and supply the existing taophacdo schema first';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='customer_id' and data_type='text') then
 raise exception 'Expected customers.customer_id TEXT; do not replace with UUID'; end if;
end $$;

insert into public.permissions(code,display_name) values
 ('social.read','Đọc dữ liệu đa kênh được phân công'),
 ('social.write','Thao tác dữ liệu đa kênh được phân công'),
 ('social.manage','Quản trị cấu hình đa kênh'),
 ('social.export','Xuất dữ liệu đa kênh') on conflict(code) do nothing;
-- Grant to existing super_admin only. Other roles are granted explicitly after review.
insert into public.role_permissions(role_name,permission_code)
 select r.name,p.code from public.roles r cross join public.permissions p
 where r.name='super_admin' and p.code in ('social.read','social.write','social.manage','social.export')
 on conflict do nothing;

create table if not exists public.social_teams(
 id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
create table if not exists public.social_team_members(
 team_id uuid not null references public.social_teams(id) on delete cascade,
 user_id uuid not null references public.admin_users(id) on delete cascade,
 primary key(team_id,user_id));
create table if not exists public.social_channels(
 id uuid primary key default gen_random_uuid(),provider text not null,external_id text not null,
 name text not null,status text not null default 'disconnected',disconnected_at timestamptz,
 capabilities jsonb not null default '{}',created_at timestamptz not null default now(),unique(provider,external_id));
create table if not exists public.social_channel_teams(
 channel_id uuid not null references public.social_channels(id) on delete cascade,
 team_id uuid not null references public.social_teams(id) on delete cascade,primary key(channel_id,team_id));
-- Provider secrets belong in Vault / server secret manager, never in browser-readable tables.
create table if not exists public.social_contents(
 id uuid primary key default gen_random_uuid(),title text not null,body text not null default '',media jsonb not null default '[]',
 status text not null default 'draft',created_by uuid not null references public.admin_users(id),
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.social_publications(
 id uuid primary key default gen_random_uuid(),content_id uuid not null references public.social_contents(id),
 channel_id uuid not null references public.social_channels(id),snapshot jsonb not null,
 scheduled_at timestamptz not null,status text not null default 'scheduled',attempts integer not null default 0,
 idempotency_key uuid not null unique,external_id text,external_url text,last_error text,
 claimed_at timestamptz,created_at timestamptz not null default now());
create index if not exists social_due_jobs on public.social_publications(scheduled_at) where status='scheduled';
create table if not exists public.social_identities(
 id uuid primary key default gen_random_uuid(),customer_id text not null references public.customers(customer_id),
 channel_id uuid not null references public.social_channels(id),external_user_id text not null,verified_by uuid references public.admin_users(id),
 created_at timestamptz not null default now(),unique(channel_id,external_user_id));
create table if not exists public.social_conversations(
 id uuid primary key default gen_random_uuid(),channel_id uuid not null references public.social_channels(id),
 customer_id text references public.customers(customer_id),identity_id uuid references public.social_identities(id),
 kind text not null check(kind in ('message','comment')),external_thread_id text not null,post_id text,comment_id text,
 assigned_to uuid references public.admin_users(id),status text not null default 'open' check(status in ('open','pending','resolved')),
 tags jsonb not null default '[]',waiting_since timestamptz,last_inbound_at timestamptz,version integer not null default 1,
 created_at timestamptz not null default now(),unique(channel_id,kind,external_thread_id));
create table if not exists public.social_messages(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.social_conversations(id),
 direction text not null check(direction in ('incoming','outgoing','note')),body text not null default '',media jsonb not null default '[]',
 external_id text,status text not null,created_by uuid references public.admin_users(id),created_at timestamptz not null default now(),
 unique(conversation_id,external_id));
create table if not exists public.social_leads(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.social_conversations(id),
 customer_id text references public.customers(customer_id),phone text not null,stage text not null default 'NEW'
 check(stage in ('NEW','CONTACTING','QUALIFIED','WON','LOST')),lost_reason text,assigned_to uuid references public.admin_users(id),
 source_publication_id uuid references public.social_publications(id),created_at timestamptz not null default now(),
 check(stage<>'LOST' or length(trim(lost_reason))>0),unique(conversation_id,phone));
create table if not exists public.social_customer_journeys(
 customer_id text primary key references public.customers(customer_id),stage text not null default 'MOI'
 check(stage in ('MOI','DA_CALL','DONG_TIEN','DANG_HOC','SAP_HET_HAN','DA_XONG')),
 assigned_to uuid references public.admin_users(id),start_date date,end_date date,version integer not null default 1,
 updated_at timestamptz not null default now(),check(end_date is null or start_date is null or end_date>=start_date));
create table if not exists public.social_journey_events(
 id uuid primary key default gen_random_uuid(),customer_id text not null references public.customers(customer_id),
 from_stage text,to_stage text not null,reason text,actor uuid references public.admin_users(id),created_at timestamptz not null default now());
create table if not exists public.social_orders(
 id uuid primary key default gen_random_uuid(),code text not null unique,customer_id text not null references public.customers(customer_id),
 conversation_id uuid references public.social_conversations(id),status text not null default 'draft',
 subtotal numeric not null check(subtotal>=0),discount numeric not null default 0 check(discount>=0),
 shipping_fee numeric not null default 0 check(shipping_fee>=0),total numeric not null check(total>=0),
 paid numeric not null default 0 check(paid>=0),address_snapshot jsonb not null default '{}',
 created_by uuid not null references public.admin_users(id),created_at timestamptz not null default now(),
 check(discount<=subtotal),check(total=subtotal-discount+shipping_fee),check(paid<=total));
create table if not exists public.social_order_items(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.social_orders(id),
 product_id uuid references public.products(id),course_id text references public.courses(id),
 kind text not null check(kind in ('physical','service','course')),name_snapshot text not null,
 quantity integer not null check(quantity>0),unit_price numeric not null check(unit_price>=0),
 check((kind='course' and course_id is not null and product_id is null) or (kind in ('physical','service') and product_id is not null and course_id is null)));
create table if not exists public.social_enrollments(
 id uuid primary key default gen_random_uuid(),customer_id text not null references public.customers(customer_id),
 course_id text not null references public.courses(id),order_id uuid references public.social_orders(id),
 status text not null default 'pending_start',start_date date,end_date date,created_at timestamptz not null default now(),
 unique(customer_id,course_id,order_id));
create table if not exists public.social_inventory(
 product_id uuid primary key references public.products(id),on_hand integer not null default 0 check(on_hand>=0),
 reserved integer not null default 0 check(reserved>=0),version integer not null default 1,check(reserved<=on_hand));
create table if not exists public.social_stock_movements(
 id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),
 order_id uuid references public.social_orders(id),delta integer not null,reserved_delta integer not null default 0,
 reason text not null,actor uuid references public.admin_users(id),created_at timestamptz not null default now());
create table if not exists public.social_shipments(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.social_orders(id),
 carrier text not null,tracking_code text,status text not null default 'creating',cod numeric not null default 0,
 fee numeric not null default 0,settled_amount numeric,request_key uuid not null unique,created_at timestamptz not null default now());
create table if not exists public.social_webhook_events(
 id uuid primary key default gen_random_uuid(),channel_id uuid not null references public.social_channels(id),
 external_event_id text not null,payload jsonb not null,received_at timestamptz not null default now(),
 processed_at timestamptz,attempts integer not null default 0,next_attempt_at timestamptz,last_error text,
 unique(channel_id,external_event_id));
create table if not exists public.social_tags(id uuid primary key default gen_random_uuid(),name text not null unique,color text not null,display_row integer not null check(display_row in(1,2)));
create table if not exists public.social_reply_templates(id uuid primary key default gen_random_uuid(),name text not null,shortcut text unique,blocks jsonb not null default '[]');

-- Helpers use auth.uid(), never an untrusted user ID supplied by the browser.
create or replace function public.social_has_permission(required_code text) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_users a where a.id=auth.uid() and
 (a.role='super_admin' or exists(select 1 from public.role_permissions rp where rp.role_name=a.role and rp.permission_code=required_code)));
$$;
create or replace function public.social_can_channel(target uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select public.social_has_permission('social.manage') or
 (public.social_has_permission('social.read') and exists(select 1 from public.social_channel_teams ct
 join public.social_team_members tm on tm.team_id=ct.team_id where ct.channel_id=target and tm.user_id=auth.uid()));
$$;
create or replace function public.social_can_customer(target text) returns boolean
 language sql stable security definer set search_path='' as $$
 select public.social_has_permission('social.manage') or exists(select 1 from public.social_conversations c
 where c.customer_id=target and public.social_can_channel(c.channel_id)) or
 (public.social_has_permission('social.read') and exists(select 1 from public.social_customer_journeys j where j.customer_id=target and j.assigned_to=auth.uid()));
$$;
revoke all on function public.social_has_permission(text),public.social_can_channel(uuid),public.social_can_customer(text) from public;
grant execute on function public.social_has_permission(text),public.social_can_channel(uuid),public.social_can_customer(text) to authenticated;

-- Deny by default. Only managers mutate through SQL initially. Agent mutations must
-- use audited transactional RPCs after staging tests; this migration grants no broad writes.
do $$ declare t text; begin
 foreach t in array array['social_teams','social_team_members','social_channels','social_channel_teams','social_contents','social_publications','social_identities','social_conversations','social_messages','social_leads','social_customer_journeys','social_journey_events','social_orders','social_order_items','social_enrollments','social_inventory','social_stock_movements','social_shipments','social_webhook_events','social_tags','social_reply_templates'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='social_manager_read') then
 execute format('create policy social_manager_read on public.%I for select to authenticated using (public.social_has_permission(''social.manage''))',t);
 end if;
 end loop;
end $$;
-- Scoped read policies. Existing core-table policies are intentionally untouched.
create policy social_channel_read on public.social_channels for select to authenticated using(public.social_can_channel(id));
create policy social_publication_read on public.social_publications for select to authenticated using(public.social_can_channel(channel_id));
create policy social_conversation_read on public.social_conversations for select to authenticated using(public.social_can_channel(channel_id));
create policy social_identity_read on public.social_identities for select to authenticated using(public.social_can_channel(channel_id));
create policy social_message_read on public.social_messages for select to authenticated using(exists(select 1 from public.social_conversations c where c.id=conversation_id and public.social_can_channel(c.channel_id)));
create policy social_lead_read on public.social_leads for select to authenticated using(exists(select 1 from public.social_conversations c where c.id=conversation_id and public.social_can_channel(c.channel_id)));
create policy social_journey_read on public.social_customer_journeys for select to authenticated using(public.social_can_customer(customer_id));
create policy social_journey_event_read on public.social_journey_events for select to authenticated using(public.social_can_customer(customer_id));
create policy social_order_read on public.social_orders for select to authenticated using(public.social_can_customer(customer_id));
create policy social_enrollment_read on public.social_enrollments for select to authenticated using(public.social_can_customer(customer_id));
create policy social_item_read on public.social_order_items for select to authenticated using(exists(select 1 from public.social_orders o where o.id=order_id and public.social_can_customer(o.customer_id)));
create policy social_shipment_read on public.social_shipments for select to authenticated using(exists(select 1 from public.social_orders o where o.id=order_id and public.social_can_customer(o.customer_id)));
commit;
