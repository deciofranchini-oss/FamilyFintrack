-- Family FinTrack migration: Scheduled auto-run logs (admin audit)
-- Safe to run multiple times

create table if not exists public.scheduled_run_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid,
  scheduled_id uuid,
  scheduled_date date,
  transaction_id uuid,
  status varchar default 'confirmed',
  amount numeric,
  description text,
  created_at timestamptz default now()
);

create index if not exists scheduled_run_logs_family_idx on public.scheduled_run_logs(family_id);
create index if not exists scheduled_run_logs_date_idx on public.scheduled_run_logs(scheduled_date);
create index if not exists scheduled_run_logs_sched_idx on public.scheduled_run_logs(scheduled_id);

-- Optional: keep referential integrity if desired (commented because some environments may differ)
-- alter table public.scheduled_run_logs add constraint scheduled_run_logs_family_fk foreign key (family_id) references public.families(id);
