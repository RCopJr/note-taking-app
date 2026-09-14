alter table public.notes
  add column title text not null default '',
  add column tags text[] not null default '{}',
  add column size bigint generated always as (octet_length(content)) stored,
  add column search_text text not null default '',
  add column search_vector tsvector generated always as (
    to_tsvector('simple'::regconfig, search_text)
  ) stored;

drop index public.notes_active_search_idx;

create index notes_active_search_idx
  on public.notes using gin (search_vector)
  where deleted_at is null;

grant usage on schema public to authenticated;
grant select, insert, update on public.folders, public.notes to authenticated;
revoke all on public.folders, public.notes from anon;

create function public.save_note(
  p_id uuid,
  p_content text,
  p_expected_revision bigint,
  p_title text,
  p_tags text[],
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
    content = p_content,
    title = p_title,
    tags = p_tags,
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

revoke all on function public.save_note(uuid, text, bigint, text, text[], text) from public, anon;
grant execute on function public.save_note(uuid, text, bigint, text, text[], text) to authenticated;

create function public.search_notes(p_query text, p_limit integer default 30)
returns table (
  note_id uuid,
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
  order by 5 desc, n.updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.search_notes(text, integer) from public, anon;
grant execute on function public.search_notes(text, integer) to authenticated;
