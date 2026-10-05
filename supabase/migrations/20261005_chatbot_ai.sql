-- Chatbot + multi-channel bridge. Additive migration; no changes to phacdo columns.
-- Prerequisites: public.admin_users(id,role), customers(id), permissions, role_permissions.
-- Backend must map local user IDs to Supabase Auth UUIDs before switching persistence.
begin;
create table if not exists public.mc_progress_stages (
 code text primary key, name text not null, primary_staff_id uuid references public.admin_users(id),
 version bigint not null default 1, updated_at timestamptz not null default now()
);
insert into public.mc_progress_stages(code,name) values
 ('NEW','Người mới'),('DEPOSIT','Đã đặt cọc'),('APPOINTMENT','Hẹn tư vấn'),('CONSULTED','Đã tư vấn'),
 ('PAID','Đã đủ tiền'),('STUDYING','Đang học'),('EXPIRING','Sắp hết hạn'),('EXPIRED','Đã hết hạn') on conflict(code) do nothing;
create table if not exists public.mc_channels (
 id uuid primary key default gen_random_uuid(), local_id text unique, provider text not null, name text not null,
 external_account_id text, connection_status text not null default 'disconnected', capabilities jsonb not null default '{}',
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_channel_staff (
 channel_id uuid references public.mc_channels(id) on delete cascade, staff_id uuid references public.admin_users(id) on delete cascade,
 primary key(channel_id,staff_id)
);
create table if not exists public.mc_contacts (
 id uuid primary key default gen_random_uuid(), local_id text unique, display_name text not null,
 phacdo_customer_id uuid references public.customers(id), progress_code text not null default 'NEW' references public.mc_progress_stages(code),
 progress_details jsonb not null default '{}', version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_progress_history (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.mc_contacts(id),
 from_code text references public.mc_progress_stages(code), to_code text not null references public.mc_progress_stages(code),
 source text not null, actor_id uuid references public.admin_users(id), note text, created_at timestamptz not null default now()
);
create table if not exists public.mc_identities (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.mc_contacts(id),
 channel_id uuid not null references public.mc_channels(id), external_user_id text not null,
 unique(channel_id,external_user_id)
);
create table if not exists public.mc_conversations (
 id uuid primary key default gen_random_uuid(), local_id text unique, channel_id uuid not null references public.mc_channels(id),
 contact_id uuid references public.mc_contacts(id), external_thread_id text not null, thread_type integer not null default 0 check(thread_type in (0,1)),
 title text, metadata jsonb not null default '{}', version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(channel_id,external_thread_id)
);
create table if not exists public.mc_media_assets (
 id uuid primary key default gen_random_uuid(), local_id text unique, name text not null, description text not null default '',
 media_type text not null check(media_type in ('image','video')), mime text not null, size_bytes bigint not null check(size_bytes>=0),
 width integer check(width>=0), height integer check(height>=0), duration_seconds numeric check(duration_seconds>=0),
 storage_bucket text not null default 'mc-media', storage_path text not null,
 channel_id uuid references public.mc_channels(id), scopes text[] not null default array['chat','post','template'],
 tags text[] not null default '{}', uploaded_by uuid references public.admin_users(id), active boolean not null default true,
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(storage_bucket,storage_path), check(scopes <@ array['chat','post','template']::text[] and cardinality(scopes)>0)
);
create table if not exists public.mc_media_categories (
 id uuid primary key default gen_random_uuid(), name text not null, description text not null default '', sort_order integer not null default 0,
 active boolean not null default true, version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_media_category_items (
 asset_id uuid references public.mc_media_assets(id), category_id uuid references public.mc_media_categories(id), primary key(asset_id,category_id)
);
create table if not exists public.mc_media_favorites (
 staff_id uuid references public.admin_users(id), asset_id uuid references public.mc_media_assets(id), primary key(staff_id,asset_id)
);
create table if not exists public.mc_reply_templates (
 id uuid primary key default gen_random_uuid(), local_id text unique, name text not null, answer_text text not null,
 usage_instructions text not null default '', enabled boolean not null default true,
 created_by uuid references public.admin_users(id), version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_reply_template_media (
 template_id uuid references public.mc_reply_templates(id), asset_id uuid references public.mc_media_assets(id),
 position integer not null default 0 check(position>=0), primary key(template_id,asset_id), unique(template_id,position)
);
create table if not exists public.mc_ai_connections (
 id uuid primary key default gen_random_uuid(), local_id text unique, name text not null,
 provider text not null check(provider in ('openai','gemini')), model text not null, secret_ref text not null,
 project_id text, organization_id text, enabled boolean not null default true,
 last_test_at timestamptz, last_test_status text, last_test_error_code text,
 created_by uuid references public.admin_users(id), version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- API keys live in backend secret storage, never in browser-readable tables.
create table if not exists public.mc_chatbots (
 id uuid primary key default gen_random_uuid(), local_id text unique, name text not null, description text not null default '',
 ai_connection_id uuid not null references public.mc_ai_connections(id), general_instructions text not null,
 response_delay_seconds integer not null default 10 check(response_delay_seconds between 0 and 3600),
 enabled boolean not null default false, created_by uuid not null references public.admin_users(id),
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_chatbot_templates (
 bot_id uuid references public.mc_chatbots(id), template_id uuid references public.mc_reply_templates(id),
 position integer not null default 0, primary key(bot_id,template_id)
);
create table if not exists public.mc_chatbot_stages (
 bot_id uuid references public.mc_chatbots(id), progress_code text references public.mc_progress_stages(code), primary key(bot_id,progress_code)
);
create table if not exists public.mc_chatbot_channels (
 bot_id uuid references public.mc_chatbots(id), channel_id uuid references public.mc_channels(id), primary key(bot_id,channel_id)
);
create table if not exists public.mc_chatbot_routes (
 progress_code text not null, channel_id uuid not null, bot_id uuid not null,
 updated_by uuid references public.admin_users(id), updated_at timestamptz not null default now(),
 primary key(progress_code,channel_id), foreign key(bot_id,progress_code) references public.mc_chatbot_stages(bot_id,progress_code),
 foreign key(bot_id,channel_id) references public.mc_chatbot_channels(bot_id,channel_id)
);
create table if not exists public.mc_conversation_ai_settings (
 conversation_id uuid primary key references public.mc_conversations(id), enabled boolean not null default true,
 manual_off boolean not null default false, off_reason text, changed_by uuid references public.admin_users(id),
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_messages (
 id uuid primary key default gen_random_uuid(), local_id text unique, conversation_id uuid not null references public.mc_conversations(id),
 external_message_id text, direction text not null check(direction in ('incoming','outgoing','note')),
 sender_type text not null default 'customer' check(sender_type in ('customer','staff','ai','system')),
 text text not null default '', send_status text not null, history boolean not null default false,
 actor_id uuid references public.admin_users(id), provider_timestamp timestamptz,
 created_at timestamptz not null default now(), unique(conversation_id,external_message_id)
);
create table if not exists public.mc_message_media (
 message_id uuid references public.mc_messages(id), position integer not null check(position>=0),
 asset_id uuid references public.mc_media_assets(id), snapshot jsonb not null default '{}', primary key(message_id,position)
);
create table if not exists public.mc_chatbot_jobs (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.mc_conversations(id),
 bot_id uuid not null references public.mc_chatbots(id), progress_code text not null references public.mc_progress_stages(code),
 due_at timestamptz not null, status text not null default 'waiting' check(status in ('waiting','running','dispatching','done','cancelled','failed','unknown')),
 dedupe_key text not null unique, conversation_revision bigint not null, locked_until timestamptz, worker_id text,
 attempt_count integer not null default 0, cancel_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_chatbot_job_messages (
 job_id uuid references public.mc_chatbot_jobs(id), message_id uuid references public.mc_messages(id), primary key(job_id,message_id)
);
create table if not exists public.mc_chatbot_receipts (
 message_id uuid primary key references public.mc_messages(id), created_at timestamptz not null default now()
);
create table if not exists public.mc_chatbot_runs (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.mc_chatbot_jobs(id),
 conversation_id uuid not null references public.mc_conversations(id), bot_id uuid not null references public.mc_chatbots(id),
 bot_version bigint not null, template_snapshots jsonb not null default '[]', selection jsonb,
 status text not null, error_code text, message_id uuid references public.mc_messages(id),
 usage jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_staff_handoffs (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.mc_conversations(id),
 contact_id uuid references public.mc_contacts(id), progress_code text not null references public.mc_progress_stages(code),
 assigned_staff_id uuid references public.admin_users(id), bot_run_id uuid references public.mc_chatbot_runs(id),
 question_snapshot jsonb not null default '[]', reason text not null, status text not null default 'open' check(status in ('open','processing','resolved')),
 accepted_at timestamptz, resolved_at timestamptz, version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mc_staff_notifications (
 id uuid primary key default gen_random_uuid(), handoff_id uuid not null references public.mc_staff_handoffs(id),
 recipient_id uuid not null references public.admin_users(id), read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.mc_message_outbox (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.mc_chatbot_runs(id),
 conversation_id uuid not null references public.mc_conversations(id), part_index integer not null check(part_index>=0),
 payload_snapshot jsonb not null, status text not null default 'waiting', external_message_id text,
 dedupe_key text not null unique, attempt_count integer not null default 0, locked_until timestamptz,
 error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(run_id,part_index)
);
create table if not exists public.mc_media_usage_events (
 id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.mc_media_assets(id),
 message_id uuid references public.mc_messages(id), source_type text not null check(source_type in ('chat','publication')),
 publication_ref text, dedupe_key text not null unique, used_at timestamptz not null default now(),
 check((source_type='chat' and message_id is not null) or (source_type='publication' and publication_ref is not null))
);
create index if not exists mc_messages_time on public.mc_messages(conversation_id,provider_timestamp,id);
create index if not exists mc_contacts_progress on public.mc_contacts(progress_code);
create index if not exists mc_conversations_contact on public.mc_conversations(contact_id,channel_id);
create index if not exists mc_jobs_due on public.mc_chatbot_jobs(status,due_at);
create unique index if not exists mc_jobs_one_waiting on public.mc_chatbot_jobs(conversation_id) where status='waiting';
create unique index if not exists mc_handoff_one_open on public.mc_staff_handoffs(conversation_id) where status in ('open','processing');
create index if not exists mc_handoff_assignee on public.mc_staff_handoffs(assigned_staff_id,status,created_at);
create index if not exists mc_usage_time on public.mc_media_usage_events(asset_id,used_at);
insert into public.permissions(code,display_name) values ('manage_chatbots','Cấu hình chatbot'),('toggle_chatbots','Bật/tắt chatbot trong chat'),('view_chatbot_logs','Xem nhật ký chatbot') on conflict(code) do nothing;
create or replace function public.mc_has_permission(p_code text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_users u where u.id=auth.uid() and (u.role='super_admin' or exists(select 1 from public.role_permissions r where r.role_name=u.role and r.permission_code=p_code)))
$$;
create or replace function public.mc_can_channel(p_channel uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.mc_has_permission('manage_chatbots') or exists(select 1 from public.mc_channel_staff s where s.channel_id=p_channel and s.staff_id=auth.uid())
$$;
create or replace function public.mc_can_conversation(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mc_conversations c where c.id=p_id and public.mc_can_channel(c.channel_id))
$$;
create or replace function public.mc_can_asset(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mc_media_assets a where a.id=p_id and (a.channel_id is null and exists(select 1 from public.admin_users u where u.id=auth.uid()) or public.mc_can_channel(a.channel_id)))
$$;
-- All writes below use the authenticated backend API; client SQL writes are denied.
-- RLS remains defense in depth for authenticated reads. No plaintext secrets in these tables.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename = any(array['mc_progress_stages','mc_channels','mc_channel_staff','mc_contacts','mc_progress_history','mc_identities','mc_conversations','mc_media_assets','mc_media_categories','mc_media_category_items','mc_media_favorites','mc_reply_templates','mc_reply_template_media','mc_ai_connections','mc_chatbots','mc_chatbot_templates','mc_chatbot_stages','mc_chatbot_channels','mc_chatbot_routes','mc_conversation_ai_settings','mc_messages','mc_message_media','mc_chatbot_jobs','mc_chatbot_job_messages','mc_chatbot_receipts','mc_chatbot_runs','mc_staff_handoffs','mc_staff_notifications','mc_message_outbox','mc_media_usage_events']::text[]) loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('drop policy if exists mc_admin_read on public.%I',t);
 execute format('create policy mc_admin_read on public.%I for select to authenticated using (public.mc_has_permission(''manage_chatbots''))',t);
 end loop;
end $$;
-- Re-running the migration recreates named staff policies safely.
do $migration$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where (schemaname='public' and tablename = any(array['mc_progress_stages','mc_channels','mc_channel_staff','mc_contacts','mc_progress_history','mc_identities','mc_conversations','mc_media_assets','mc_media_categories','mc_media_category_items','mc_media_favorites','mc_reply_templates','mc_reply_template_media','mc_ai_connections','mc_chatbots','mc_chatbot_templates','mc_chatbot_stages','mc_chatbot_channels','mc_chatbot_routes','mc_conversation_ai_settings','mc_messages','mc_message_media','mc_chatbot_jobs','mc_chatbot_job_messages','mc_chatbot_receipts','mc_chatbot_runs','mc_staff_handoffs','mc_staff_notifications','mc_message_outbox','mc_media_usage_events']::text[]) and policyname like 'mc\_%' escape '\' and policyname<>'mc_admin_read') or (schemaname='storage' and tablename='objects' and policyname='mc_storage_read') loop
 execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $migration$;
-- Scoped staff reads, intentionally no INSERT/UPDATE/DELETE policies for clients.
create policy mc_stage_staff_read on public.mc_progress_stages for select to authenticated using(exists(select 1 from public.admin_users where id=auth.uid()));
create policy mc_channel_read on public.mc_channels for select to authenticated using(public.mc_can_channel(id));
create policy mc_channel_staff_read on public.mc_channel_staff for select to authenticated using(staff_id=auth.uid());
create policy mc_contact_read on public.mc_contacts for select to authenticated using(exists(select 1 from public.mc_conversations c where c.contact_id=mc_contacts.id and public.mc_can_channel(c.channel_id)));
create policy mc_identity_read on public.mc_identities for select to authenticated using(public.mc_can_channel(channel_id));
create policy mc_conversation_read on public.mc_conversations for select to authenticated using(public.mc_can_channel(channel_id));
create policy mc_message_read on public.mc_messages for select to authenticated using(public.mc_can_conversation(conversation_id));
create policy mc_message_media_read on public.mc_message_media for select to authenticated using(exists(select 1 from public.mc_messages m where m.id=message_id and public.mc_can_conversation(m.conversation_id)));
create policy mc_asset_read on public.mc_media_assets for select to authenticated using(public.mc_can_asset(id));
create policy mc_category_read on public.mc_media_categories for select to authenticated using(exists(select 1 from public.admin_users where id=auth.uid()));
create policy mc_category_item_read on public.mc_media_category_items for select to authenticated using(public.mc_can_asset(asset_id));
create policy mc_favorite_read on public.mc_media_favorites for select to authenticated using(staff_id=auth.uid() and public.mc_can_asset(asset_id));
create policy mc_ai_setting_read on public.mc_conversation_ai_settings for select to authenticated using(public.mc_can_conversation(conversation_id));
create policy mc_handoff_read on public.mc_staff_handoffs for select to authenticated using(assigned_staff_id=auth.uid() and public.mc_can_conversation(conversation_id));
create policy mc_notification_read on public.mc_staff_notifications for select to authenticated using(recipient_id=auth.uid());
create policy mc_runs_read on public.mc_chatbot_runs for select to authenticated using(public.mc_has_permission('view_chatbot_logs') and public.mc_can_conversation(conversation_id));
create policy mc_jobs_read on public.mc_chatbot_jobs for select to authenticated using(public.mc_has_permission('view_chatbot_logs') and public.mc_can_conversation(conversation_id));
-- Private storage; upload and metadata validation go through backend, including channel scope.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('mc-media','mc-media',false,524288000,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']) on conflict(id) do nothing;
create policy mc_storage_read on storage.objects for select to authenticated using(bucket_id='mc-media' and exists(select 1 from public.mc_media_assets a where a.storage_bucket=storage.objects.bucket_id and a.storage_path=storage.objects.name and public.mc_can_asset(a.id)));
-- Worker acquisition: service role only, atomic claim with lease.
create or replace function public.mc_claim_chatbot_jobs(p_worker text,p_limit integer default 10)
 returns setof public.mc_chatbot_jobs language sql security definer set search_path='' as $$
 update public.mc_chatbot_jobs j set status='running',worker_id=p_worker,locked_until=now()+interval '90 seconds',attempt_count=j.attempt_count+1,updated_at=now()
 where j.id in (select q.id from public.mc_chatbot_jobs q where q.status='waiting' and q.due_at<=now() order by q.due_at for update skip locked limit greatest(1,least(p_limit,100))) returning j.*
$$;
revoke all on function public.mc_claim_chatbot_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.mc_claim_chatbot_jobs(text,integer) to service_role;
revoke all on function public.mc_has_permission(text), public.mc_can_channel(uuid), public.mc_can_conversation(uuid), public.mc_can_asset(uuid) from public,anon;
grant execute on function public.mc_has_permission(text), public.mc_can_channel(uuid), public.mc_can_conversation(uuid), public.mc_can_asset(uuid) to authenticated,service_role;
-- Optimistic revisions and updated_at for configuration tables.
create or replace function public.mc_touch_version() returns trigger language plpgsql set search_path='' as $migration$
begin new.version=old.version+1; new.updated_at=now(); return new; end $migration$;
do $migration$ declare t text; begin
 foreach t in array array['mc_progress_stages','mc_channels','mc_contacts','mc_conversations','mc_media_assets','mc_media_categories','mc_reply_templates','mc_ai_connections','mc_chatbots','mc_conversation_ai_settings','mc_staff_handoffs'] loop
 execute format('drop trigger if exists mc_touch on public.%I',t);
 execute format('create trigger mc_touch before update on public.%I for each row execute function public.mc_touch_version()',t);
 end loop;
end $migration$;
-- Realtime is notification delivery, not the background AI worker.
do $migration$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['mc_staff_notifications','mc_staff_handoffs','mc_messages','mc_conversation_ai_settings'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
 execute format('alter publication supabase_realtime add table public.%I',t);
 end if; end loop; end if;
end $migration$;
commit;
