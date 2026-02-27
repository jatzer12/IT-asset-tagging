-- PCC IT Asset Tagging: security and performance hardening
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Optional helper for role checks in RLS policies.
-- Remove older versions first (different return type/signature).
do $$
declare f record;
begin
  for f in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arg_list
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_app_role'
  loop
    execute format(
      'drop function if exists %I.%I(%s) cascade',
      f.schema_name,
      f.function_name,
      f.arg_list
    );
  end loop;
end $$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select role::text from public.profiles where id = auth.uid() limit 1),
    ''
  )
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

-- Resolve display names for user IDs without exposing full profiles to all roles.
create or replace function public.lookup_usernames(user_ids uuid[])
returns table(id uuid, username text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    coalesce(nullif(p.username, ''), nullif(u.email, ''), p.id::text) as username
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = any(user_ids)
$$;

revoke all on function public.lookup_usernames(uuid[]) from public;
grant execute on function public.lookup_usernames(uuid[]) to authenticated;

-- Indexes for faster search/filter with large asset counts.
create index if not exists idx_assets_asset_tag on public.assets(asset_tag);
create index if not exists idx_assets_asset_name on public.assets(asset_name);
create index if not exists idx_assets_serial on public.assets(serial_number);
create index if not exists idx_assets_assigned_user on public.assets(assigned_user);
create index if not exists idx_assets_department on public.assets(department);
create index if not exists idx_assets_status on public.assets(status);
create index if not exists idx_assets_lifecycle_year on public.assets(lifecycle_year);
create index if not exists idx_comments_asset_id on public.asset_comments(asset_id);
create index if not exists idx_audit_asset_id on public.asset_audit(asset_id);
create index if not exists idx_audit_actor_user on public.asset_audit(actor_user_id);

alter table public.assets enable row level security;
alter table public.asset_comments enable row level security;
alter table public.asset_audit enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;

-- Profiles
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.current_app_role() in ('MANAGER', 'SUPERVISOR')
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.current_app_role() in ('MANAGER', 'SUPERVISOR')
)
with check (
  id = auth.uid()
  or public.current_app_role() in ('MANAGER', 'SUPERVISOR')
);

-- Assets
drop policy if exists assets_select_all_auth on public.assets;
create policy assets_select_all_auth on public.assets
for select
to authenticated
using (true);

drop policy if exists assets_insert_all_auth on public.assets;
create policy assets_insert_all_auth on public.assets
for insert
to authenticated
with check (true);

drop policy if exists assets_update_all_auth on public.assets;
create policy assets_update_all_auth on public.assets
for update
to authenticated
using (true)
with check (true);

drop policy if exists assets_delete_mgr_sup on public.assets;
create policy assets_delete_mgr_sup on public.assets
for delete
to authenticated
using (public.current_app_role() in ('MANAGER', 'SUPERVISOR'));

-- Departments
drop policy if exists departments_select_all_auth on public.departments;
create policy departments_select_all_auth on public.departments
for select
to authenticated
using (true);

drop policy if exists departments_write_mgr_sup on public.departments;
create policy departments_write_mgr_sup on public.departments
for all
to authenticated
using (public.current_app_role() in ('MANAGER', 'SUPERVISOR'))
with check (public.current_app_role() in ('MANAGER', 'SUPERVISOR'));

-- Asset comments
drop policy if exists comments_select_all_auth on public.asset_comments;
create policy comments_select_all_auth on public.asset_comments
for select
to authenticated
using (true);

drop policy if exists comments_insert_all_auth on public.asset_comments;
create policy comments_insert_all_auth on public.asset_comments
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists comments_delete_mgr_sup on public.asset_comments;
create policy comments_delete_mgr_sup on public.asset_comments
for delete
to authenticated
using (public.current_app_role() in ('MANAGER', 'SUPERVISOR'));

-- Audit
drop policy if exists audit_select_mgr_sup on public.asset_audit;
create policy audit_select_mgr_sup on public.asset_audit
for select
to authenticated
using (public.current_app_role() in ('MANAGER', 'SUPERVISOR'));

drop policy if exists audit_insert_all_auth on public.asset_audit;
create policy audit_insert_all_auth on public.asset_audit
for insert
to authenticated
with check (actor_user_id = auth.uid());
