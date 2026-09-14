create function public.validate_folder_parent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise check_violation using message = 'A folder cannot parent itself.';
  end if;

  if not exists (
    select 1
    from public.folders as parent
    where parent.id = new.parent_id
      and parent.owner_id = new.owner_id
      and parent.deleted_at is null
  ) then
    raise foreign_key_violation using message = 'The selected parent folder is unavailable.';
  end if;

  if exists (
    with recursive ancestors as (
      select parent.id, parent.parent_id
      from public.folders as parent
      where parent.id = new.parent_id
        and parent.owner_id = new.owner_id
      union all
      select parent.id, parent.parent_id
      from public.folders as parent
      join ancestors on parent.id = ancestors.parent_id
      where parent.owner_id = new.owner_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise check_violation using message = 'A folder cannot be moved inside itself.';
  end if;

  return new;
end;
$$;

create trigger folders_validate_parent
before insert or update of owner_id, parent_id on public.folders
for each row execute function public.validate_folder_parent();

create function public.validate_note_folder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.folder_id is not null and not exists (
    select 1
    from public.folders as folder
    where folder.id = new.folder_id
      and folder.owner_id = new.owner_id
      and folder.deleted_at is null
  ) then
    raise foreign_key_violation using message = 'The selected folder is unavailable.';
  end if;

  return new;
end;
$$;

create trigger notes_validate_folder
before insert or update of owner_id, folder_id on public.notes
for each row execute function public.validate_note_folder();

create function public.update_note_metadata(
  p_id uuid,
  p_name text,
  p_folder_id uuid,
  p_expected_revision bigint,
  p_search_text text
)
returns table (
  outcome text,
  note_id uuid,
  folder_id uuid,
  name text,
  title text,
  tags text[],
  content text,
  revision bigint,
  updated_at timestamptz,
  size bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update public.notes as n
  set
    name = p_name,
    folder_id = p_folder_id,
    search_text = p_search_text,
    revision = n.revision + 1
  where n.id = p_id
    and n.owner_id = auth.uid()
    and n.revision = p_expected_revision
    and n.deleted_at is null
  returning
    'saved'::text,
    n.id,
    n.folder_id,
    n.name,
    n.title,
    n.tags,
    n.content,
    n.revision,
    n.updated_at,
    n.size;

  if found then
    return;
  end if;

  return query
  select
    'conflict'::text,
    n.id,
    n.folder_id,
    n.name,
    n.title,
    n.tags,
    n.content,
    n.revision,
    n.updated_at,
    n.size
  from public.notes as n
  where n.id = p_id
    and n.owner_id = auth.uid()
    and n.deleted_at is null;

  if found then
    return;
  end if;

  return query
  select
    'not_found'::text,
    p_id,
    null::uuid,
    null::text,
    null::text,
    null::text[],
    null::text,
    null::bigint,
    null::timestamptz,
    null::bigint;
end;
$$;

create function public.set_note_deleted(
  p_id uuid,
  p_expected_revision bigint,
  p_deleted boolean
)
returns table (
  outcome text,
  note_id uuid,
  folder_id uuid,
  name text,
  title text,
  tags text[],
  content text,
  revision bigint,
  updated_at timestamptz,
  size bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not p_deleted and exists (
    select 1
    from public.notes as n
    join public.folders as folder on folder.id = n.folder_id and folder.owner_id = n.owner_id
    where n.id = p_id
      and n.owner_id = auth.uid()
      and folder.deleted_at is not null
  ) then
    raise foreign_key_violation using message = 'Restore the containing folder first.';
  end if;

  return query
  update public.notes as n
  set
    deleted_at = case when p_deleted then clock_timestamp() else null end,
    revision = n.revision + 1
  where n.id = p_id
    and n.owner_id = auth.uid()
    and n.revision = p_expected_revision
    and ((p_deleted and n.deleted_at is null) or (not p_deleted and n.deleted_at is not null))
  returning
    'saved'::text,
    n.id,
    n.folder_id,
    n.name,
    n.title,
    n.tags,
    n.content,
    n.revision,
    n.updated_at,
    n.size;

  if found then
    return;
  end if;

  return query
  select
    'conflict'::text,
    n.id,
    n.folder_id,
    n.name,
    n.title,
    n.tags,
    n.content,
    n.revision,
    n.updated_at,
    n.size
  from public.notes as n
  where n.id = p_id
    and n.owner_id = auth.uid()
    and ((p_deleted and n.deleted_at is null) or (not p_deleted and n.deleted_at is not null));

  if found then
    return;
  end if;

  return query
  select
    'not_found'::text,
    p_id,
    null::uuid,
    null::text,
    null::text,
    null::text[],
    null::text,
    null::bigint,
    null::timestamptz,
    null::bigint;
end;
$$;

create function public.set_folder_deleted(p_id uuid, p_deleted boolean)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
begin
  if p_deleted then
    if not exists (
      select 1 from public.folders
      where id = p_id and owner_id = auth.uid() and deleted_at is null
    ) then
      return 'not_found';
    end if;

    v_deleted_at := clock_timestamp();

    with recursive subtree as (
      select id from public.folders
      where id = p_id and owner_id = auth.uid() and deleted_at is null
      union all
      select child.id
      from public.folders as child
      join subtree on child.parent_id = subtree.id
      where child.owner_id = auth.uid() and child.deleted_at is null
    )
    update public.notes
    set deleted_at = v_deleted_at, revision = revision + 1
    where owner_id = auth.uid()
      and deleted_at is null
      and folder_id in (select id from subtree);

    with recursive subtree as (
      select id from public.folders
      where id = p_id and owner_id = auth.uid() and deleted_at is null
      union all
      select child.id
      from public.folders as child
      join subtree on child.parent_id = subtree.id
      where child.owner_id = auth.uid() and child.deleted_at is null
    )
    update public.folders
    set deleted_at = v_deleted_at
    where id in (select id from subtree) and owner_id = auth.uid();

    return 'saved';
  end if;

  select deleted_at into v_deleted_at
  from public.folders
  where id = p_id and owner_id = auth.uid() and deleted_at is not null;

  if not found then
    return 'not_found';
  end if;

  if exists (
    select 1
    from public.folders as root
    join public.folders as parent on parent.id = root.parent_id and parent.owner_id = root.owner_id
    where root.id = p_id
      and root.owner_id = auth.uid()
      and parent.deleted_at is not null
  ) then
    raise foreign_key_violation using message = 'Restore the containing folder first.';
  end if;

  if exists (
    with recursive subtree as (
      select id, parent_id, name from public.folders
      where id = p_id and owner_id = auth.uid() and deleted_at = v_deleted_at
      union all
      select child.id, child.parent_id, child.name
      from public.folders as child
      join subtree on child.parent_id = subtree.id
      where child.owner_id = auth.uid() and child.deleted_at = v_deleted_at
    )
    select 1
    from subtree
    join public.folders as active
      on active.owner_id = auth.uid()
      and active.parent_id is not distinct from subtree.parent_id
      and active.name = subtree.name
      and active.deleted_at is null
  ) or exists (
    with recursive subtree as (
      select id from public.folders
      where id = p_id and owner_id = auth.uid() and deleted_at = v_deleted_at
      union all
      select child.id
      from public.folders as child
      join subtree on child.parent_id = subtree.id
      where child.owner_id = auth.uid() and child.deleted_at = v_deleted_at
    )
    select 1
    from public.notes as deleted_note
    join public.notes as active
      on active.owner_id = deleted_note.owner_id
      and active.folder_id is not distinct from deleted_note.folder_id
      and active.name = deleted_note.name
      and active.deleted_at is null
    where deleted_note.owner_id = auth.uid()
      and deleted_note.deleted_at = v_deleted_at
      and deleted_note.folder_id in (select id from subtree)
  ) then
    return 'conflict';
  end if;

  with recursive subtree as (
    select id from public.folders
    where id = p_id and owner_id = auth.uid() and deleted_at = v_deleted_at
    union all
    select child.id
    from public.folders as child
    join subtree on child.parent_id = subtree.id
    where child.owner_id = auth.uid() and child.deleted_at = v_deleted_at
  )
  update public.folders
  set deleted_at = null
  where owner_id = auth.uid() and id in (select id from subtree);

  with recursive subtree as (
    select id from public.folders
    where id = p_id and owner_id = auth.uid() and deleted_at is null
    union all
    select child.id
    from public.folders as child
    join subtree on child.parent_id = subtree.id
    where child.owner_id = auth.uid() and child.deleted_at is null
  )
  update public.notes
  set deleted_at = null, revision = revision + 1
  where owner_id = auth.uid()
    and deleted_at = v_deleted_at
    and folder_id in (select id from subtree);

  return 'saved';
end;
$$;

revoke all on function public.update_note_metadata(uuid, text, uuid, bigint, text) from public, anon;
grant execute on function public.update_note_metadata(uuid, text, uuid, bigint, text) to authenticated;

revoke all on function public.set_note_deleted(uuid, bigint, boolean) from public, anon;
grant execute on function public.set_note_deleted(uuid, bigint, boolean) to authenticated;

revoke all on function public.set_folder_deleted(uuid, boolean) from public, anon;
grant execute on function public.set_folder_deleted(uuid, boolean) to authenticated;

drop function public.search_notes(text, integer);

create function public.search_notes(p_query text, p_limit integer default 30)
returns table (
  note_id uuid,
  note_name text,
  folder_id uuid,
  title text,
  snippet text,
  tags text[],
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.id,
    n.name,
    n.folder_id,
    n.title,
    ts_headline(
      'simple'::regconfig,
      n.content,
      websearch_to_tsquery('simple'::regconfig, p_query),
      'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=8'
    ),
    n.tags,
    ts_rank(n.search_vector, websearch_to_tsquery('simple'::regconfig, p_query))::real
  from public.notes as n
  where n.owner_id = auth.uid()
    and n.deleted_at is null
    and n.search_vector @@ websearch_to_tsquery('simple'::regconfig, p_query)
  order by 7 desc, n.updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.search_notes(text, integer) from public, anon;
grant execute on function public.search_notes(text, integer) to authenticated;
