-- Wedding Halls ERP v2: isolated, additive schema. Does not modify legacy tables.
create extension if not exists pgcrypto;

create table if not exists public.wf2_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.wf2_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  full_name text not null default '',
  role text not null default 'reception' check (role in ('admin','reception','accounts')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wf2_halls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  name text not null,
  venue text not null default '',
  capacity integer not null default 0 check (capacity >= 0),
  day_price numeric(12,2) not null default 0 check (day_price >= 0),
  evening_price numeric(12,2) not null default 0 check (evening_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.wf2_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  full_name text not null,
  phone text not null,
  groom_name text not null default '',
  bride_name text not null default '',
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.wf2_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  hall_id uuid references public.wf2_halls(id) on delete set null,
  name text not null,
  guest_count integer not null default 0 check (guest_count >= 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wf2_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  customer_id uuid not null references public.wf2_customers(id) on delete restrict,
  hall_id uuid not null references public.wf2_halls(id) on delete restrict,
  package_id uuid references public.wf2_packages(id) on delete set null,
  event_date date not null,
  event_period text not null check (event_period in ('نهاري','مسائي')),
  guest_count integer not null default 0 check (guest_count >= 0),
  event_type text not null default 'حفل زفاف',
  package_name_snapshot text not null default '',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  service_rate numeric(5,2) not null default 15 check (service_rate >= 0 and service_rate <= 100),
  service_amount numeric(12,2) not null default 0 check (service_amount >= 0),
  contract_total numeric(12,2) not null default 0 check (contract_total >= 0),
  status text not null default 'مبدئي' check (status in ('مبدئي','مؤكد','مكتمل','ملغي')),
  notes text not null default '',
  invitation_token uuid not null default gen_random_uuid(),
  invitation_expires_at timestamptz,
  invitation_used_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wf2_booking_slot_unique
on public.wf2_bookings(company_id, hall_id, event_date, event_period)
where status <> 'ملغي';

create table if not exists public.wf2_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  booking_id uuid not null references public.wf2_bookings(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('كاش','فيزا','إنستا باي','محفظة','تحويل بنكي')),
  reference text not null default '',
  notes text not null default '',
  paid_by uuid not null references auth.users(id),
  paid_at timestamptz not null default now(),
  receipt_no bigint generated always as identity unique
);

create table if not exists public.wf2_booking_addons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  booking_id uuid not null references public.wf2_bookings(id) on delete cascade,
  title text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.wf2_audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.wf2_companies(id) on delete restrict,
  actor_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.wf2_company_id()
returns uuid language sql stable security definer set search_path = public, auth
as $$ select company_id from public.wf2_profiles where user_id = auth.uid() and active = true $$;

create or replace function public.wf2_role()
returns text language sql stable security definer set search_path = public, auth
as $$ select role from public.wf2_profiles where user_id = auth.uid() and active = true $$;

create or replace function public.wf2_is_member(p_company uuid)
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists(select 1 from public.wf2_profiles where user_id = auth.uid() and active = true and company_id = p_company) $$;

create or replace function public.wf2_is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.wf2_role() = 'admin', false) $$;

alter table public.wf2_companies enable row level security;
alter table public.wf2_profiles enable row level security;
alter table public.wf2_halls enable row level security;
alter table public.wf2_customers enable row level security;
alter table public.wf2_packages enable row level security;
alter table public.wf2_bookings enable row level security;
alter table public.wf2_payments enable row level security;
alter table public.wf2_booking_addons enable row level security;
alter table public.wf2_audit_logs enable row level security;

drop policy if exists wf2_company_read on public.wf2_companies;
create policy wf2_company_read on public.wf2_companies for select to authenticated using (id = public.wf2_company_id());
drop policy if exists wf2_profiles_read on public.wf2_profiles;
create policy wf2_profiles_read on public.wf2_profiles for select to authenticated using (company_id = public.wf2_company_id());
drop policy if exists wf2_profiles_admin_all on public.wf2_profiles;
create policy wf2_profiles_admin_all on public.wf2_profiles for all to authenticated using (company_id = public.wf2_company_id() and public.wf2_is_admin()) with check (company_id = public.wf2_company_id() and public.wf2_is_admin());

do $$
declare t text;
begin
  foreach t in array array['wf2_halls','wf2_customers','wf2_packages','wf2_bookings','wf2_payments','wf2_booking_addons','wf2_audit_logs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant', t);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = public.wf2_company_id())', t || '_tenant', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (company_id = public.wf2_company_id() and public.wf2_is_admin()) with check (company_id = public.wf2_company_id() and public.wf2_is_admin())', t || '_admin_write', t);
  end loop;
end $$;

drop policy if exists wf2_halls_reception_read on public.wf2_halls;
create policy wf2_halls_reception_read on public.wf2_halls for select to authenticated using (company_id = public.wf2_company_id());
drop policy if exists wf2_customers_reception_insert on public.wf2_customers;
create policy wf2_customers_reception_insert on public.wf2_customers for insert to authenticated with check (company_id = public.wf2_company_id() and public.wf2_role() in ('admin','reception'));
drop policy if exists wf2_bookings_reception_insert on public.wf2_bookings;
create policy wf2_bookings_reception_insert on public.wf2_bookings for insert to authenticated with check (company_id = public.wf2_company_id() and public.wf2_role() in ('admin','reception') and created_by = auth.uid());
drop policy if exists wf2_payments_accounts_insert on public.wf2_payments;
create policy wf2_payments_accounts_insert on public.wf2_payments for insert to authenticated with check (company_id = public.wf2_company_id() and public.wf2_role() in ('admin','accounts') and paid_by = auth.uid());
drop policy if exists wf2_addons_reception_insert on public.wf2_booking_addons;
create policy wf2_addons_reception_insert on public.wf2_booking_addons for insert to authenticated with check (company_id = public.wf2_company_id() and public.wf2_role() in ('admin','reception'));

create or replace function public.wf2_record_payment(
  p_booking_id uuid, p_amount numeric, p_method text, p_reference text default '', p_notes text default ''
) returns public.wf2_payments
language plpgsql security invoker set search_path = public, auth
as $$
declare b public.wf2_bookings; p public.wf2_payments;
begin
  if public.wf2_role() not in ('admin','accounts') then raise exception 'غير مسموح بتسجيل التحصيل'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'قيمة التحصيل يجب أن تكون أكبر من صفر'; end if;
  select * into b from public.wf2_bookings where id = p_booking_id and company_id = public.wf2_company_id() for update;
  if not found then raise exception 'الحجز غير موجود'; end if;
  if b.status = 'ملغي' then raise exception 'لا يمكن التحصيل على حجز ملغي'; end if;
  if (select coalesce(sum(amount),0) from public.wf2_payments where booking_id = p_booking_id) + p_amount > b.contract_total then
    raise exception 'قيمة التحصيل أكبر من المبلغ المتبقي';
  end if;
  insert into public.wf2_payments(company_id, booking_id, amount, method, reference, notes, paid_by)
  values (b.company_id, b.id, p_amount, p_method, coalesce(p_reference,''), coalesce(p_notes,''), auth.uid())
  returning * into p;
  insert into public.wf2_audit_logs(company_id, actor_id, action, entity, entity_id, details)
  values (b.company_id, auth.uid(), 'payment_recorded', 'booking', b.id, jsonb_build_object('payment_id',p.id,'amount',p_amount,'method',p_method));
  return p;
end $$;

grant execute on function public.wf2_record_payment(uuid,numeric,text,text,text) to authenticated;

create or replace function public.wf2_create_booking(
  p_customer_name text, p_phone text, p_groom_name text, p_bride_name text,
  p_hall_id uuid, p_event_date date, p_event_period text, p_guest_count integer,
  p_event_type text, p_subtotal numeric, p_discount numeric, p_notes text default ''
) returns public.wf2_bookings
language plpgsql security invoker set search_path = public, auth
as $$
declare c public.wf2_customers; b public.wf2_bookings; svc numeric; total numeric;
begin
  if public.wf2_role() not in ('admin','reception') then raise exception 'غير مسموح بإنشاء حجز'; end if;
  if p_event_date is null or p_event_date < current_date then raise exception 'تاريخ الحجز غير صالح'; end if;
  if p_event_period not in ('نهاري','مسائي') then raise exception 'الفترة غير صحيحة'; end if;
  if p_subtotal < 0 or p_discount < 0 or p_discount > p_subtotal then raise exception 'راجع الإجمالي والخصم'; end if;
  if not exists(select 1 from public.wf2_halls where id=p_hall_id and company_id=public.wf2_company_id() and active=true) then raise exception 'القاعة غير متاحة'; end if;
  insert into public.wf2_customers(company_id,full_name,phone,groom_name,bride_name,created_by)
  values(public.wf2_company_id(),trim(p_customer_name),trim(p_phone),coalesce(p_groom_name,''),coalesce(p_bride_name,''),auth.uid()) returning * into c;
  svc := round((p_subtotal-p_discount)*0.15,2);
  total := p_subtotal-p_discount+svc;
  insert into public.wf2_bookings(company_id,customer_id,hall_id,event_date,event_period,guest_count,event_type,subtotal,discount,service_amount,contract_total,notes,created_by)
  values(public.wf2_company_id(),c.id,p_hall_id,p_event_date,p_event_period,coalesce(p_guest_count,0),coalesce(p_event_type,'حفل زفاف'),p_subtotal,p_discount,svc,total,coalesce(p_notes,''),auth.uid())
  returning * into b;
  insert into public.wf2_audit_logs(company_id,actor_id,action,entity,entity_id,details)
  values(public.wf2_company_id(),auth.uid(),'booking_created','booking',b.id,jsonb_build_object('customer_id',c.id,'hall_id',p_hall_id,'event_date',p_event_date,'event_period',p_event_period,'total',total));
  return b;
exception when unique_violation then
  raise exception 'القاعة محجوزة بالفعل في اليوم والفترة المحددين';
end $$;

grant execute on function public.wf2_create_booking(text,text,text,text,uuid,date,text,integer,text,numeric,numeric,text) to authenticated;
