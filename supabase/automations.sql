-- GM WEBSITE: Discord Automations (Webhook-only)
-- Features:
-- 1) Planned Messages (scheduled webhook sends)
-- 2) Aktenkontrolle (weekly poll + delayed fair assignment from a name pool)
--
-- NOTE: With only a Discord Webhook URL we can only SEND messages.
-- We cannot read reactions or determine volunteers.
--
-- Safe to run multiple times.

-- =========================
-- Planned Messages
-- =========================
create table if not exists public.gm_planned_messages (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default true,
  webhook_url text not null,
  content text not null,
  schedule text not null check (schedule in ('once','daily','weekly')),
  -- once
  run_at timestamptz,
  -- daily/weekly (HH:MM, 24h)
  time_of_day text,
  -- weekly (ISO 1=Mon .. 7=Sun)
  day_of_week int,
  timezone text not null default 'Europe/Berlin',
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gm_planned_messages_next_run_idx on public.gm_planned_messages (enabled, next_run_at);

-- =========================
-- Aktenkontrolle
-- =========================
create table if not exists public.gm_akten_settings (
  id int primary key default 1,
  enabled boolean not null default false,
  webhook_url text not null,
  timezone text not null default 'Europe/Berlin',
  -- weekly schedule
  day_of_week int not null default 1 check (day_of_week between 1 and 7),
  time_of_day text not null default '18:00',
  followup_delay_minutes int not null default 180,
  next_poll_at timestamptz,
  -- tracks if a poll is active (we only need the timestamp in webhook-only mode)
  active_poll_created_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Ensure settings row exists
insert into public.gm_akten_settings (id, webhook_url)
values (1, '')
on conflict (id) do nothing;

-- Fair name pool
create table if not exists public.gm_akten_pool (
  -- name is a stable key. For ping-capable entries we store e.g. 'user:123..' or 'role:456..'
  name text primary key,
  mention_type text not null default 'user' check (mention_type in ('user','role')),
  mention_id text,
  label text,
  times_assigned int not null default 0,
  last_assigned_at timestamptz
);

-- History / audit
create table if not exists public.gm_akten_history (
  id uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null default now(),
  mode text not null check (mode in ('auto')),
  chosen_primary_name text,
  chosen_backup_name text,
  poll_created_at timestamptz
);

-- =========================
-- Migrations from older (bot/reaction) schema
-- =========================
-- Settings: drop reaction-related columns if they exist
alter table public.gm_akten_settings drop column if exists volunteer_emoji;
alter table public.gm_akten_settings drop column if exists active_poll_channel_id;
alter table public.gm_akten_settings drop column if exists active_poll_message_id;

-- Pool: if older schema exists, try to migrate minimal data
-- If gm_akten_pool has discord_user_id/display_name columns, copy display_name into name.
-- (This block is safe: it only runs when columns exist.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='gm_akten_pool' AND column_name='discord_user_id'
  ) THEN
    -- Add name column if missing
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='gm_akten_pool' AND column_name='name'
    ) THEN
      ALTER TABLE public.gm_akten_pool ADD COLUMN name text;
    END IF;

    -- Copy display_name -> name when possible
    UPDATE public.gm_akten_pool
      SET name = COALESCE(NULLIF(name,''), NULLIF(display_name,''), discord_user_id)
    WHERE name IS NULL OR name='';

    -- Drop old columns (after copy)
    ALTER TABLE public.gm_akten_pool DROP COLUMN IF EXISTS discord_user_id;
    ALTER TABLE public.gm_akten_pool DROP COLUMN IF EXISTS display_name;

    -- Ensure primary key on name
    BEGIN
      ALTER TABLE public.gm_akten_pool DROP CONSTRAINT IF EXISTS gm_akten_pool_pkey;
    EXCEPTION WHEN OTHERS THEN
      -- ignore
    END;

    ALTER TABLE public.gm_akten_pool ADD PRIMARY KEY (name);
  END IF;
END $$;

-- History: drop id-based columns if exist
alter table public.gm_akten_history drop column if exists chosen_primary_id;
alter table public.gm_akten_history drop column if exists chosen_backup_id;
alter table public.gm_akten_history drop column if exists poll_message_id;
alter table public.gm_akten_history drop column if exists poll_channel_id;

-- =========================
-- updated_at trigger helper
-- =========================
create or replace function public.gm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gm_planned_messages_touch on public.gm_planned_messages;
create trigger gm_planned_messages_touch
before update on public.gm_planned_messages
for each row execute function public.gm_touch_updated_at();

drop trigger if exists gm_akten_settings_touch on public.gm_akten_settings;
create trigger gm_akten_settings_touch
before update on public.gm_akten_settings
for each row execute function public.gm_touch_updated_at();

-- =========================
-- RLS: lock down tables (service role bypasses RLS)
-- =========================
alter table public.gm_planned_messages enable row level security;
alter table public.gm_akten_settings enable row level security;
alter table public.gm_akten_pool enable row level security;
alter table public.gm_akten_history enable row level security;

-- No policies on purpose: anon/authenticated cannot read/write.
-- Access is expected via server-side routes using the Supabase service role.


-- =========================
-- MIGRATION: make akten pool ping-capable (user/role mentions)
-- =========================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='gm_akten_pool' and column_name='mention_type'
  ) then
    alter table public.gm_akten_pool add column mention_type text not null default 'user';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='gm_akten_pool' and column_name='mention_id'
  ) then
    alter table public.gm_akten_pool add column mention_id text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='gm_akten_pool' and column_name='label'
  ) then
    alter table public.gm_akten_pool add column label text;
  end if;

  -- If old pool used just 'name', keep it as label
  update public.gm_akten_pool
    set label = coalesce(label, nullif(name,''))
  where label is null;

exception when others then
  raise notice 'Migration notice: %', SQLERRM;
end $$;
