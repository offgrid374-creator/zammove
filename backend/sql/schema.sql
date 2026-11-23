-- ZamMove database schema for Supabase Postgres.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Design: every table stores the full record in a JSONB "data" column (the backend's domain model),
-- plus generated columns for the fields you will filter, join or report on.
-- Links between tables (customer, driver, vehicle) are enforced by the backend rules.
-- Row Level Security is ON with no policies: the anon/public keys can read or write nothing.
-- Only the backend, using the service-role key, can access these tables.

create or replace function zm_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- users (id = email)
create table if not exists users (
  id text primary key,
  data jsonb not null,
  name text generated always as (data->>'name') stored,
  admin_level text generated always as (data->>'adm') stored,
  is_cashier boolean generated always as (coalesce((data->>'cash')::boolean, false)) stored,
  status text generated always as (coalesce(data->>'status', 'active')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists applications (
  id text primary key,
  data jsonb not null,
  user_email text generated always as (data->>'user') stored,
  role text generated always as (data->>'role') stored,
  status text generated always as (data->>'st') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vehicles (
  id text primary key,
  data jsonb not null,
  owner_email text generated always as (data->>'owner') stored,
  type text generated always as (data->>'type') stored,
  plate text generated always as (upper(data->>'plate')) stored,
  approval text generated always as (data->>'approval') stored,
  status text generated always as (data->>'status') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vehicles_plate_uq on vehicles (plate);

create table if not exists assignments (
  id text primary key,
  data jsonb not null,
  vehicle_id text generated always as (data->>'vehicle') stored,
  driver_email text generated always as (data->>'driver') stored,
  status text generated always as (data->>'st') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- driver availability (id = driver email)
create table if not exists driver_status (
  id text primary key references users(id) on delete cascade,
  data jsonb not null,
  availability text generated always as (data->>'avail') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bookings (
  id text primary key,
  data jsonb not null,
  customer_email text generated always as (data->>'cu') stored,
  driver_email text generated always as (data->>'drvUser') stored,
  vehicle_id text generated always as (data->>'veh') stored,
  vehicle_type text generated always as (data->>'vid') stored,
  status text generated always as (data->>'st') stored,
  pickup_date text generated always as (data->>'dt') stored,
  total numeric(12,2) generated always as ((data->>'tot')::numeric) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_status_idx on bookings (status);
create index if not exists bookings_customer_idx on bookings (customer_email);
create index if not exists bookings_driver_idx on bookings (driver_email);

create table if not exists rentals (
  id text primary key,
  data jsonb not null,
  customer_email text generated always as (data->>'cu') stored,
  vehicle_type text generated always as (data->>'vid') stored,
  status text generated always as (data->>'st') stored,
  start_date text generated always as (data->>'s') stored,
  end_date text generated always as (data->>'e') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id text primary key,
  data jsonb not null,
  ref_id text generated always as (data->>'bid') stored,          -- booking or rental id
  kind text generated always as (data->>'kind') stored,           -- down | final | rental | deposit | cancel_fee
  method text generated always as (data->>'method') stored,
  amount numeric(12,2) generated always as ((data->>'amount')::numeric) stored,
  reference text generated always as (data->>'ref') stored,
  status text generated always as (data->>'status') stored,       -- Submitted | Recorded by driver | Verified | Rejected
  payer_email text generated always as (data->>'payer') stored,
  collected_by text generated always as (data->>'collectedBy') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_ref_idx on payments (ref_id);
create index if not exists payments_status_idx on payments (status);

create table if not exists incidents (
  id text primary key,
  data jsonb not null,
  booking_id text generated always as (data->>'bid') stored,
  reporter_email text generated always as (data->>'by') stored,
  severity text generated always as (data->>'sev') stored,
  status text generated always as (data->>'st') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id text primary key,
  data jsonb not null,
  booking_id text generated always as (data->>'bid') stored,
  rating int generated always as ((data->>'r')::int) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  data jsonb not null,
  recipient_email text generated always as (data->>'to') stored,
  is_read boolean generated always as (coalesce((data->>'r')::boolean, false)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_to_idx on notifications (recipient_email);

create table if not exists remittances (
  id text primary key,
  data jsonb not null,
  driver_email text generated always as (data->>'drv') stored,
  week text generated always as (data->>'week') stored,
  status text generated always as (data->>'st') stored,
  amount_due numeric(12,2) generated always as ((data->>'due')::numeric) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id text primary key,
  data jsonb not null,
  actor text generated always as (data->>'who') stored,
  event text generated always as (data->>'evt') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- settings (single row id = 'main': remittance rate, driver response time, later pricing)
create table if not exists settings (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['users','applications','vehicles','assignments','driver_status','bookings','rentals','payments','incidents','reviews','notifications','remittances','audit_log','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function zm_touch()', t || '_touch', t);
  end loop;
end $$;
