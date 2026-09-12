create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint folders_owner_id_id_key unique (owner_id, id),
  constraint folders_name_normalized_check check (name = btrim(name) and name <> ''),
  constraint folders_not_own_parent_check check (parent_id is null or parent_id <> id),
  constraint folders_parent_owner_fkey
    foreign key (owner_id, parent_id)
    references public.folders (owner_id, id)
    on delete cascade
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid,
  name text not null,
  content text not null default '',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notes_owner_id_id_key unique (owner_id, id),
  constraint notes_name_normalized_check check (name = btrim(name) and name <> ''),
  constraint notes_revision_positive_check check (revision > 0),
  constraint notes_folder_owner_fkey
    foreign key (owner_id, folder_id)
    references public.folders (owner_id, id)
    on delete cascade
);

create unique index folders_active_sibling_name_key
  on public.folders (owner_id, parent_id, name) nulls not distinct
  where deleted_at is null;

create index folders_active_tree_idx
  on public.folders (owner_id, parent_id, name)
  where deleted_at is null;

create unique index notes_active_sibling_name_key
  on public.notes (owner_id, folder_id, name) nulls not distinct
  where deleted_at is null;

create index notes_active_recent_idx
  on public.notes (owner_id, updated_at desc)
  where deleted_at is null;

create index notes_active_search_idx
  on public.notes using gin (
    to_tsvector('simple'::regconfig, name || ' ' || content)
  )
  where deleted_at is null;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger folders_set_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.folders enable row level security;
alter table public.notes enable row level security;

create policy "Users can read their folders"
on public.folders
for select
using ((select auth.uid()) = owner_id);

create policy "Users can create their folders"
on public.folders
for insert
with check ((select auth.uid()) = owner_id);

create policy "Users can update their folders"
on public.folders
for update
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their folders"
on public.folders
for delete
using ((select auth.uid()) = owner_id);

create policy "Users can read their notes"
on public.notes
for select
using ((select auth.uid()) = owner_id);

create policy "Users can create their notes"
on public.notes
for insert
with check ((select auth.uid()) = owner_id);

create policy "Users can update their notes"
on public.notes
for update
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their notes"
on public.notes
for delete
using ((select auth.uid()) = owner_id);
