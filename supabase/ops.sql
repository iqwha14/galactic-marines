-- GM Operations Module (Supabase) - SQL
-- Run in Supabase SQL editor.

create extension if not exists "uuid-ossp";

create table if not exists public.operations (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  planet text not null,
  start_at timestamptz not null,
  end_at timestamptz null,
  units text[] not null default '{}'::text[],
  outcome text not null default 'Unklar',
  summary text not null default '',
  image_url text null,
  status text not null default 'Bevorstehend',
  map_grid text null,
  created_by_discord_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.operation_participants (
  operation_id uuid not null references public.operations(id) on delete cascade,
  marine_card_id text not null,
  role text null,
  is_lead boolean not null default false,
  primary key (operation_id, marine_card_id)
);

create table if not exists public.operation_ratings (
  operation_id uuid not null references public.operations(id) on delete cascade,
  discord_id text not null,
  stars int not null check (stars between 1 and 5),
  comment text null,
  created_at timestamptz not null default now(),
  primary key (operation_id, discord_id)
);

create table if not exists public.marine_ratings (
  operation_id uuid not null references public.operations(id) on delete cascade,
  marine_card_id text not null,
  discord_id text not null,
  stars int not null check (stars between 1 and 5),
  comment text null,
  created_at timestamptz not null default now(),
  primary key (operation_id, marine_card_id, discord_id)
);

-- Killlogs: funny / visible to everyone
create table if not exists public.operation_killlogs (
  id uuid primary key default uuid_generate_v4(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  discord_id text not null,
  marine_card_id text null,
  display_name text null,
  deaths int not null default 1 check (deaths between 1 and 99),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_killlogs_op on public.operation_killlogs(operation_id);
create index if not exists idx_killlogs_created on public.operation_killlogs(created_at desc);

create table if not exists public.operation_reports (
  id uuid primary key default uuid_generate_v4(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  author_discord_id text not null,
  title text not null,
  content_md text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unit membership mapping (Discord -> Trello marine card)
-- Enables: self-service "Einsatz beitreten" and participation-gated ratings.
create table if not exists public.gm_unit_members (
  discord_id text primary key,
  marine_card_id text not null,
  display_name text null,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_gm_unit_members_card on public.gm_unit_members(marine_card_id);
create index if not exists idx_gm_unit_members_updated on public.gm_unit_members(updated_at desc);

create index if not exists idx_operations_start_at on public.operations(start_at desc);
create index if not exists idx_participants_op on public.operation_participants(operation_id);
create index if not exists idx_reports_op on public.operation_reports(operation_id);

-- MVP Voting
-- Each participant votes once per operation. When all eligible voters have voted, the app auto-announces the MVP.
alter table public.operations add column if not exists mvp_card_id text null;
alter table public.operations add column if not exists mvp_announced_at timestamptz null;

create table if not exists public.operation_mvp_votes (
  operation_id uuid not null references public.operations(id) on delete cascade,
  voter_discord_id text not null,
  mvp_card_id text not null,
  created_at timestamptz not null default now(),
  primary key (operation_id, voter_discord_id)
);

create index if not exists idx_mvp_votes_op on public.operation_mvp_votes(operation_id);
create index if not exists idx_mvp_votes_created on public.operation_mvp_votes(created_at desc);

-- Storage (manual):
-- 1) Supabase -> Storage -> Create bucket: operation-images
-- 2) Make bucket PUBLIC (so we can show images via public URL)
