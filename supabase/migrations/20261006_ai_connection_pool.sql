-- Run after the existing chatbot migration. Backend/service_role writes only.
begin;
alter table public.mc_chatbots alter column ai_connection_id drop not null;
create table if not exists public.mc_chatbot_ai_connections (
 bot_id uuid not null references public.mc_chatbots(id) on delete cascade,
 connection_id uuid not null references public.mc_ai_connections(id) on delete cascade,
 primary key(bot_id,connection_id)
);
insert into public.mc_chatbot_ai_connections(bot_id,connection_id)
 select id,ai_connection_id from public.mc_chatbots where ai_connection_id is not null on conflict do nothing;
create table if not exists public.mc_ai_connection_health (
 connection_id uuid primary key references public.mc_ai_connections(id) on delete cascade,
 config_version bigint not null, attempts bigint not null default 0, errors bigint not null default 0,
 quota_errors bigint not null default 0, consecutive_errors bigint not null default 0,
 last_attempt_at timestamptz, last_success_at timestamptz, last_error text,
 last_status integer, last_latency_ms bigint, cooldown_until timestamptz,
 check(errors <= attempts), check(quota_errors <= errors)
);
alter table public.mc_chatbot_ai_connections enable row level security;
alter table public.mc_ai_connection_health enable row level security;
revoke all on public.mc_chatbot_ai_connections,public.mc_ai_connection_health from anon,authenticated;
grant select on public.mc_chatbot_ai_connections,public.mc_ai_connection_health to authenticated;
grant all on public.mc_chatbot_ai_connections,public.mc_ai_connection_health to service_role;
drop policy if exists mc_pool_admin_read on public.mc_chatbot_ai_connections;
create policy mc_pool_admin_read on public.mc_chatbot_ai_connections for select to authenticated using(public.mc_has_permission('manage_chatbots'));
drop policy if exists mc_health_admin_read on public.mc_ai_connection_health;
create policy mc_health_admin_read on public.mc_ai_connection_health for select to authenticated using(public.mc_has_permission('manage_chatbots'));
commit;
