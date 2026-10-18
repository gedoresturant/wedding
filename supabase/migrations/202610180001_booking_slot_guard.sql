-- Prevent two active bookings from taking the same hall/date/period.
-- Cancelled/rejected and soft-deleted bookings do not block the slot.
create unique index if not exists bookings_no_active_hall_slot
on public.bookings (company_id, hall_id, event_date, event_period)
where coalesce(deleted_at, '') = ''
  and status not in ('ملغي', 'مرفوض');
