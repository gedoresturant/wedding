-- Wedding Halls ERP sync foundation for Supabase PostgreSQL
-- Run in Supabase SQL Editor. Do not expose service_role key in frontend code.
create extension if not exists pgcrypto;

create table if not exists public.erp_sync_records (
  id uuid primary key default gen_random_uuid(),
  company_slug text not null,
  table_name text not null,
  record_id bigint not null,
  payload jsonb,
  row_hash text not null,
  source_instance text not null,
  version bigint not null default 1,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(company_slug, table_name, record_id)
);

create index if not exists erp_sync_records_company_updated
  on public.erp_sync_records(company_slug, updated_at desc);
create index if not exists erp_sync_records_table_record
  on public.erp_sync_records(table_name, record_id);

alter table public.erp_sync_records enable row level security;
revoke all on public.erp_sync_records from anon, authenticated;
grant all on public.erp_sync_records to service_role;

create table if not exists public.erp_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_slug text not null,
  table_name text not null,
  record_id bigint not null,
  local_payload jsonb,
  remote_payload jsonb,
  local_hash text not null,
  remote_hash text not null,
  local_instance text not null,
  remote_instance text not null,
  status text not null default 'pending' check (status in ('pending','resolved_local','resolved_remote','merged')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.erp_sync_conflicts enable row level security;
revoke all on public.erp_sync_conflicts from anon, authenticated;
grant all on public.erp_sync_conflicts to service_role;

-- Optional heartbeat to display whether a sync worker has contacted the cloud.
create table if not exists public.erp_sync_instances (
  instance_id text primary key,
  company_slug text not null,
  app_version text not null default '1.1.0',
  last_seen_at timestamptz not null default now(),
  sync_status text not null default 'starting',
  last_error text
);
alter table public.erp_sync_instances enable row level security;
revoke all on public.erp_sync_instances from anon, authenticated;
grant all on public.erp_sync_instances to service_role;
