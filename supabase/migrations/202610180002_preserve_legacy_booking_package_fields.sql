-- Preserve fields used by the existing SQLite application.
-- Additive-only migration: does not delete or rewrite existing rows.
alter table public.bookings
  add column if not exists extra_guest_total double precision not null default 0,
  add column if not exists included_guest_count_snapshot bigint not null default 0,
  add column if not exists included_items_snapshot text not null default '';

alter table public.packages
  add column if not exists included_guest_count bigint not null default 0,
  add column if not exists extra_guest_price double precision not null default 0,
  add column if not exists included_items text not null default '';

alter table public.users
  alter column permissions_json set default '[]';
