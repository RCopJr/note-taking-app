create table public.markdown_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_path text not null,
  source_hash text not null,
  imported_path text not null,
  note_id uuid not null,
  imported_at timestamptz not null default now(),
  constraint markdown_imports_note_owner_fkey
    foreign key (owner_id, note_id)
    references public.notes (owner_id, id)
    on delete cascade,
  constraint markdown_imports_source_path_check check (source_path <> ''),
  constraint markdown_imports_source_hash_check check (source_hash ~ '^[a-f0-9]{64}$'),
  constraint markdown_imports_owner_source_key unique (owner_id, source_path, source_hash)
);

create index markdown_imports_owner_note_idx
  on public.markdown_imports (owner_id, note_id);

alter table public.markdown_imports enable row level security;

create policy "Users can read their Markdown imports"
on public.markdown_imports
for select
using ((select auth.uid()) = owner_id);

create policy "Users can create their Markdown imports"
on public.markdown_imports
for insert
with check ((select auth.uid()) = owner_id);

create policy "Users can update their Markdown imports"
on public.markdown_imports
for update
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

grant select, insert, update on public.markdown_imports to authenticated;
revoke all on public.markdown_imports from anon;

create function public.import_markdown_note(
  p_source_path text,
  p_source_hash text,
  p_target_path text,
  p_folder_names text[],
  p_name text,
  p_content text,
  p_title text,
  p_tags text[],
  p_search_text text
)
returns table (
  outcome text,
  note_id uuid,
  imported_path text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_parent_id uuid;
  v_folder_id uuid;
  v_note_id uuid;
  v_existing_content text;
  v_segment text;
begin
  if v_owner_id is null then
    raise insufficient_privilege using message = 'Authentication is required.';
  end if;

  select mi.note_id, mi.imported_path
  into v_note_id, imported_path
  from public.markdown_imports as mi
  join public.notes as n
    on n.id = mi.note_id
    and n.owner_id = mi.owner_id
    and n.deleted_at is null
  where mi.owner_id = v_owner_id
    and mi.source_path = p_source_path
    and mi.source_hash = p_source_hash;

  if found then
    return query select 'skipped'::text, v_note_id, imported_path;
    return;
  end if;

  foreach v_segment in array p_folder_names loop
    if exists (
      select 1
      from public.notes as n
      where n.owner_id = v_owner_id
        and n.folder_id is not distinct from v_parent_id
        and n.name = v_segment
        and n.deleted_at is null
    ) then
      raise unique_violation using message = 'A note blocks an imported folder path.';
    end if;

    select f.id
    into v_folder_id
    from public.folders as f
    where f.owner_id = v_owner_id
      and f.parent_id is not distinct from v_parent_id
      and f.name = v_segment
      and f.deleted_at is null;

    if v_folder_id is null then
      insert into public.folders (owner_id, parent_id, name)
      values (v_owner_id, v_parent_id, v_segment)
      returning id into v_folder_id;
    end if;

    v_parent_id := v_folder_id;
    v_folder_id := null;
  end loop;

  if exists (
    select 1
    from public.folders as f
    where f.owner_id = v_owner_id
      and f.parent_id is not distinct from v_parent_id
      and f.name = p_name
      and f.deleted_at is null
  ) then
    raise unique_violation using message = 'A folder blocks the imported note path.';
  end if;

  select n.id, n.content
  into v_note_id, v_existing_content
  from public.notes as n
  where n.owner_id = v_owner_id
    and n.folder_id is not distinct from v_parent_id
    and n.name = p_name
    and n.deleted_at is null;

  if v_note_id is not null then
    if v_existing_content is distinct from p_content then
      raise unique_violation using message = 'An existing note uses the imported path.';
    end if;

    insert into public.markdown_imports (
      owner_id, source_path, source_hash, imported_path, note_id
    ) values (
      v_owner_id, p_source_path, p_source_hash, p_target_path, v_note_id
    )
    on conflict (owner_id, source_path, source_hash)
    do update set
      imported_path = excluded.imported_path,
      note_id = excluded.note_id,
      imported_at = now();

    return query select 'skipped'::text, v_note_id, p_target_path;
    return;
  end if;

  insert into public.notes (
    owner_id, folder_id, name, content, title, tags, search_text
  ) values (
    v_owner_id, v_parent_id, p_name, p_content, p_title, p_tags, p_search_text
  )
  returning id into v_note_id;

  insert into public.markdown_imports (
    owner_id, source_path, source_hash, imported_path, note_id
  ) values (
    v_owner_id, p_source_path, p_source_hash, p_target_path, v_note_id
  )
  on conflict (owner_id, source_path, source_hash)
  do update set
    imported_path = excluded.imported_path,
    note_id = excluded.note_id,
    imported_at = now();

  return query select 'imported'::text, v_note_id, p_target_path;
end;
$$;

revoke all on function public.import_markdown_note(text, text, text, text[], text, text, text, text[], text) from public, anon;
grant execute on function public.import_markdown_note(text, text, text, text[], text, text, text, text[], text) to authenticated;
