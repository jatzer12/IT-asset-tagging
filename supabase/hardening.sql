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

-- Enforce case-insensitive, trimmed uniqueness for asset tags at DB level.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'ux_assets_asset_tag_canonical'
  ) then
    begin
      execute 'create unique index ux_assets_asset_tag_canonical on public.assets ((lower(btrim(asset_tag))))';
    exception
      when others then
        raise notice 'Could not create unique canonical asset_tag index: %', sqlerrm;
    end;
  end if;
end $$;

-- Trash bin archive for deleted assets (restorable).
create table if not exists public.deleted_assets (
  id bigserial primary key,
  original_asset_id bigint,
  asset_tag text not null,
  asset_name text,
  serial_number text,
  device_type text,
  model text,
  assigned_user text,
  location text,
  room_number text,
  department text,
  purchase_date date,
  lifecycle_year integer,
  asset_value numeric,
  status text,
  notes text,
  requested_by_user_id uuid,
  requested_by_username text,
  requested_at timestamptz,
  deleted_by_user_id uuid not null,
  deleted_by_username text,
  deleted_at timestamptz not null default now(),
  delete_action text not null default 'DELETE',
  snapshot jsonb not null default '{}'::jsonb
);
create index if not exists idx_deleted_assets_asset_tag on public.deleted_assets(asset_tag);
create index if not exists idx_deleted_assets_deleted_at on public.deleted_assets(deleted_at desc);

-- Atomic operations for delete/archive and trash bin restore/purge.
create or replace function public.archive_and_delete_asset(p_asset_id bigint, p_action text default 'DELETE')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := public.current_app_role();
  v_user_id uuid := auth.uid();
  v_username text := null;
  v_asset public.assets%rowtype;
  v_deleted_id bigint;
begin
  if v_role not in ('MANAGER', 'SUPERVISOR') then
    return jsonb_build_object('ok', false, 'message', 'Permission denied.');
  end if;
  if p_asset_id is null then
    return jsonb_build_object('ok', false, 'message', 'Asset id is required.');
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  select *
  into v_asset
  from public.assets
  where id = p_asset_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Asset not found.');
  end if;

  insert into public.deleted_assets (
    original_asset_id,
    asset_tag,
    asset_name,
    serial_number,
    device_type,
    model,
    assigned_user,
    location,
    room_number,
    department,
    purchase_date,
    lifecycle_year,
    asset_value,
    status,
    notes,
    requested_by_user_id,
    requested_by_username,
    requested_at,
    deleted_by_user_id,
    deleted_by_username,
    delete_action,
    snapshot
  )
  values (
    v_asset.id,
    v_asset.asset_tag,
    v_asset.asset_name,
    v_asset.serial_number,
    v_asset.device_type,
    v_asset.model,
    v_asset.assigned_user,
    v_asset.location,
    v_asset.room_number,
    v_asset.department,
    v_asset.purchase_date,
    v_asset.lifecycle_year,
    v_asset.asset_value,
    v_asset.status,
    v_asset.notes,
    v_asset.pending_delete_by,
    (select username from public.profiles where id = v_asset.pending_delete_by limit 1),
    v_asset.pending_delete_at,
    v_user_id,
    coalesce(nullif(v_username, ''), v_user_id::text),
    coalesce(nullif(upper(btrim(p_action)), ''), 'DELETE'),
    to_jsonb(v_asset)
  )
  returning id into v_deleted_id;

  delete from public.assets where id = v_asset.id;

  return jsonb_build_object(
    'ok', true,
    'deleted_asset_id', v_deleted_id,
    'asset_tag', v_asset.asset_tag
  );
end;
$$;

revoke all on function public.archive_and_delete_asset(bigint, text) from public;
grant execute on function public.archive_and_delete_asset(bigint, text) to authenticated;

create or replace function public.restore_deleted_asset(p_deleted_asset_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := public.current_app_role();
  v_user_id uuid := auth.uid();
  v_row public.deleted_assets%rowtype;
  v_existing_id bigint;
  v_new_id bigint;
begin
  if v_role not in ('MANAGER', 'SUPERVISOR') then
    return jsonb_build_object('ok', false, 'message', 'Permission denied.');
  end if;
  if p_deleted_asset_id is null then
    return jsonb_build_object('ok', false, 'message', 'Deleted asset id is required.');
  end if;

  select *
  into v_row
  from public.deleted_assets
  where id = p_deleted_asset_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Trash record not found.');
  end if;

  select id
  into v_existing_id
  from public.assets
  where lower(btrim(asset_tag)) = lower(btrim(v_row.asset_tag))
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('ok', false, 'message', 'An active asset with the same Asset Tag already exists.');
  end if;

  insert into public.assets (
    asset_tag,
    asset_name,
    serial_number,
    device_type,
    model,
    assigned_user,
    location,
    room_number,
    department,
    purchase_date,
    lifecycle_year,
    asset_value,
    status,
    notes,
    pending_delete_by,
    pending_delete_at,
    created_by,
    updated_by
  )
  values (
    v_row.asset_tag,
    coalesce(v_row.asset_name, ''),
    v_row.serial_number,
    coalesce(v_row.device_type, ''),
    v_row.model,
    v_row.assigned_user,
    v_row.location,
    v_row.room_number,
    v_row.department,
    v_row.purchase_date,
    v_row.lifecycle_year,
    v_row.asset_value,
    coalesce(v_row.status, 'INVENTORY'),
    v_row.notes,
    null,
    null,
    v_user_id,
    v_user_id
  )
  returning id into v_new_id;

  delete from public.deleted_assets where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'asset_id', v_new_id,
    'asset_tag', v_row.asset_tag
  );
end;
$$;

revoke all on function public.restore_deleted_asset(bigint) from public;
grant execute on function public.restore_deleted_asset(bigint) to authenticated;

create or replace function public.purge_deleted_asset(p_deleted_asset_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := public.current_app_role();
  v_row public.deleted_assets%rowtype;
begin
  if v_role not in ('MANAGER', 'SUPERVISOR') then
    return jsonb_build_object('ok', false, 'message', 'Permission denied.');
  end if;
  if p_deleted_asset_id is null then
    return jsonb_build_object('ok', false, 'message', 'Deleted asset id is required.');
  end if;

  select * into v_row from public.deleted_assets where id = p_deleted_asset_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Trash record not found.');
  end if;

  delete from public.deleted_assets where id = v_row.id;
  return jsonb_build_object('ok', true, 'asset_tag', v_row.asset_tag);
end;
$$;

revoke all on function public.purge_deleted_asset(bigint) from public;
grant execute on function public.purge_deleted_asset(bigint) to authenticated;

alter table public.assets enable row level security;
alter table public.asset_comments enable row level security;
alter table public.asset_audit enable row level security;
alter table public.deleted_assets enable row level security;
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

-- Deleted assets archive
drop policy if exists deleted_assets_select_mgr_sup on public.deleted_assets;
create policy deleted_assets_select_mgr_sup on public.deleted_assets
for select
to authenticated
using (public.current_app_role() in ('MANAGER', 'SUPERVISOR'));

drop policy if exists deleted_assets_insert_mgr_sup on public.deleted_assets;
create policy deleted_assets_insert_mgr_sup on public.deleted_assets
for insert
to authenticated
with check (public.current_app_role() in ('MANAGER', 'SUPERVISOR'));

drop policy if exists deleted_assets_delete_mgr_sup on public.deleted_assets;
create policy deleted_assets_delete_mgr_sup on public.deleted_assets
for delete
to authenticated
using (public.current_app_role() in ('MANAGER', 'SUPERVISOR'));
