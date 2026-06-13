-- technician_locations table
-- Run this in the Supabase SQL Editor if the Live Map / Tech Locations tabs show an error.

create table if not exists public.technician_locations (
  technician_id uuid primary key references auth.users(id) on delete cascade,
  latitude      double precision not null,
  longitude     double precision not null,
  updated_at    timestamptz      not null default now()
);

-- Enable RLS
alter table public.technician_locations enable row level security;

-- Admins can read all locations
create policy "admins can read technician_locations"
  on public.technician_locations
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Technicians can upsert their own location (mobile app)
create policy "technicians can upsert own location"
  on public.technician_locations
  for all
  using  (auth.uid() = technician_id)
  with check (auth.uid() = technician_id);

-- Keep updated_at current on every write
create or replace function public.touch_technician_location()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_technician_location on public.technician_locations;
create trigger trg_touch_technician_location
  before insert or update on public.technician_locations
  for each row execute function public.touch_technician_location();
