create table if not exists sf_meter_transactions (
  id uuid primary key default gen_random_uuid(),
  transmission_datetime text unique,
  post_id text,
  street_block text,
  payment_type text,
  session_start_dt timestamptz,
  gross_paid_amt numeric,
  meter_event_type text,
  lat numeric,
  lng numeric,
  geocoded boolean default false,
  created_at timestamptz default now()
);

create table if not exists sf_meter_meta (
  key text primary key,
  value text
);

alter publication supabase_realtime add table sf_meter_transactions;

alter table sf_meter_transactions enable row level security;
create policy "anon select" on sf_meter_transactions for select to anon using (true);

alter table sf_meter_meta enable row level security;
create policy "anon select" on sf_meter_meta for select to anon using (true);
