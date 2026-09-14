begin;

create extension if not exists pgtap with schema extensions;
select plan(56);

select ok(
  to_regclass('public.folders') is not null,
  'folders table exists'
);

select ok(
  to_regclass('public.notes') is not null,
  'notes table exists'
);

select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.folders'::regclass$$,
  array[true],
  'folders has row-level security enabled'
);

select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.notes'::regclass$$,
  array[true],
  'notes has row-level security enabled'
);

select ok(
  to_regclass('public.folders_active_sibling_name_key') is not null,
  'folders enforce active sibling name uniqueness'
);

select ok(
  to_regclass('public.notes_active_sibling_name_key') is not null,
  'notes enforce active sibling name uniqueness'
);

select ok(
  to_regclass('public.notes_active_search_idx') is not null,
  'notes have a full-text search index'
);

select has_column('public', 'notes', 'title', 'notes store derived titles');
select has_column('public', 'notes', 'tags', 'notes store derived tags');

select has_function(
  'public',
  'save_note',
  array['uuid', 'text', 'bigint', 'text', 'text[]', 'text'],
  'revision-aware save function exists'
);

select has_function(
  'public',
  'search_notes',
  array['text', 'integer'],
  'cloud note search function exists'
);

select has_function(
  'public',
  'update_note_metadata',
  array['uuid', 'text', 'uuid', 'bigint', 'text'],
  'revision-aware note rename and move function exists'
);

select has_function(
  'public',
  'set_note_deleted',
  array['uuid', 'bigint', 'boolean'],
  'revision-aware note deletion function exists'
);

select has_function(
  'public',
  'set_folder_deleted',
  array['uuid', 'boolean'],
  'transactional folder deletion function exists'
);

select throws_ok(
  $$insert into public.folders (owner_id, name) values ('11111111-1111-4111-8111-111111111111', ' untrimmed ')$$,
  '23514',
  null,
  'folder names must be non-empty and trimmed'
);

select throws_ok(
  $$insert into public.folders (id, owner_id, parent_id, name) values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Self')$$,
  '23514',
  null,
  'a folder cannot parent itself'
);

select throws_ok(
  $$insert into public.folders (owner_id, parent_id, name) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Cross-owner child')$$,
  '23503',
  null,
  'a folder parent must have the same owner'
);

insert into public.folders (owner_id, name)
values ('11111111-1111-4111-8111-111111111111', 'Duplicate');

select throws_ok(
  $$insert into public.folders (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'Duplicate')$$,
  '23505',
  null,
  'active root folder names are unique per owner'
);

update public.folders
set deleted_at = now()
where owner_id = '11111111-1111-4111-8111-111111111111'
  and name = 'Duplicate';

select lives_ok(
  $$insert into public.folders (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'Duplicate')$$,
  'a soft-deleted folder name can be reused'
);

select throws_ok(
  $$insert into public.notes (owner_id, folder_id, name) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'cross-owner.md')$$,
  '23503',
  null,
  'a note folder must have the same owner'
);

select throws_ok(
  $$insert into public.notes (owner_id, name, revision) values ('11111111-1111-4111-8111-111111111111', 'invalid-revision.md', 0)$$,
  '23514',
  null,
  'note revisions must be positive'
);

insert into public.notes (owner_id, name)
values ('11111111-1111-4111-8111-111111111111', 'duplicate.md');

select throws_ok(
  $$insert into public.notes (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'duplicate.md')$$,
  '23505',
  null,
  'active root note names are unique per owner'
);

set local role anon;

select throws_ok(
  $$select count(*) from public.notes$$,
  '42501',
  null,
  'anonymous users cannot read notes'
);

select throws_ok(
  $$insert into public.notes (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'anonymous.md')$$,
  '42501',
  null,
  'anonymous users cannot create notes'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select count(*) from public.notes where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'$$,
  array[1::bigint],
  'a user can read their own note'
);

select results_eq(
  $$select count(*) from public.notes where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  array[0::bigint],
  'a user cannot read another user note'
);

select results_eq(
  $$update public.notes set content = 'compromised' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' returning 1$$,
  $$values (1) limit 0$$,
  'a user cannot update another user note'
);

select results_eq(
  $$delete from public.notes where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' returning 1$$,
  $$values (1) limit 0$$,
  'a user cannot delete another user note'
);

select throws_ok(
  $$insert into public.notes (owner_id, name) values ('22222222-2222-4222-8222-222222222222', 'forged.md')$$,
  '42501',
  null,
  'a user cannot create a note for another owner'
);

select throws_ok(
  $$update public.notes set owner_id = '22222222-2222-4222-8222-222222222222' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'$$,
  '23503',
  null,
  'a user cannot transfer a note into another owner hierarchy'
);

select lives_ok(
  $$insert into public.notes (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'allowed.md')$$,
  'a user can create their own note'
);


select results_eq(
  $$select outcome from public.save_note(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    '# Cloud Welcome',
    1,
    'Cloud Welcome',
    array['cloud'],
    'welcome.md Cloud Welcome cloud # Cloud Welcome'
  )$$,
  array['saved'::text],
  'a current revision saves successfully'
);

select results_eq(
  $$select revision from public.notes where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'$$,
  array[2::bigint],
  'an accepted save advances the revision'
);

select results_eq(
  $$select outcome from public.save_note(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    '# Stale overwrite',
    1,
    'Stale overwrite',
    array[]::text[],
    'stale overwrite'
  )$$,
  array['conflict'::text],
  'a stale revision reports a conflict'
);

select results_eq(
  $$select content from public.notes where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'$$,
  array['# Cloud Welcome'::text],
  'a stale save does not overwrite committed content'
);

select results_eq(
  $$select outcome from public.save_note(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '# Hidden overwrite',
    1,
    'Hidden overwrite',
    array[]::text[],
    'hidden overwrite'
  )$$,
  array['not_found'::text],
  'another owner note is indistinguishable from a missing note'
);

select results_eq(
  $$select note_id from public.search_notes('Cloud Welcome', 30)$$,
  array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid],
  'search finds committed content owned by the user'
);

select lives_ok(
  $$insert into public.folders (id, owner_id, name) values
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111', 'Ancestor'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '11111111-1111-4111-8111-111111111111', 'Descendant');
    update public.folders
    set parent_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'$$,
  'a valid nested folder hierarchy can be created'
);

select throws_ok(
  $$update public.folders
    set parent_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  '23514',
  null,
  'a folder cannot move under its descendant'
);

select results_eq(
  $$select outcome from public.update_note_metadata(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'renamed.md',
    null,
    2,
    'renamed.md Cloud Welcome cloud # Cloud Welcome'
  )$$,
  array['saved'::text],
  'a current revision can rename and move a note'
);

select results_eq(
  $$select id, revision from public.notes where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'$$,
  $$values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid, 3::bigint)$$,
  'note identity stays stable and revision advances after metadata changes'
);

select results_eq(
  $$select note_id from public.search_notes('renamed.md', 30)$$,
  array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid],
  'search reflects a renamed note transactionally'
);

select results_eq(
  $$select outcome from public.set_note_deleted(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    3,
    true
  )$$,
  array['saved'::text],
  'a current note revision can be soft deleted'
);

select results_eq(
  $$select count(*) from public.notes
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' and deleted_at is null$$,
  array[0::bigint],
  'a deleted note is absent from active-note queries'
);

select results_eq(
  $$select count(*) from public.search_notes('Cloud Welcome', 30)$$,
  array[0::bigint],
  'a deleted note is absent from search results'
);

select results_eq(
  $$select outcome from public.set_note_deleted(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    4,
    false
  )$$,
  array['saved'::text],
  'a deleted note can be restored'
);

select results_eq(
  $$select revision from public.notes
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' and deleted_at is null$$,
  array[5::bigint],
  'restoring a note advances its revision'
);

select results_eq(
  $$select outcome from public.set_note_deleted(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    4,
    true
  )$$,
  array['conflict'::text],
  'a stale client cannot delete a newer note revision'
);

select lives_ok(
  $$insert into public.folders (id, owner_id, parent_id, name) values
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', '11111111-1111-4111-8111-111111111111', null, 'Delete tree'),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc4', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'Child');
    insert into public.notes (id, owner_id, folder_id, name, content)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4', 'nested.md', '# Nested')$$,
  'a folder subtree fixture can be created'
);

select results_eq(
  $$select public.set_folder_deleted('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', true)$$,
  array['saved'::text],
  'a folder subtree can be soft deleted transactionally'
);

select results_eq(
  $$select
      (select count(*) from public.folders where id in (
        'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
        'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'
      ) and deleted_at is not null),
      (select count(*) from public.notes
        where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3' and deleted_at is not null)$$,
  $$values (2::bigint, 1::bigint)$$,
  'folder deletion tombstones descendants and their notes'
);

select results_eq(
  $$select public.set_folder_deleted('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', false)$$,
  array['saved'::text],
  'a deleted folder subtree can be restored'
);

select results_eq(
  $$select
      (select count(*) from public.folders where id in (
        'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
        'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'
      ) and deleted_at is null),
      (select count(*) from public.notes
        where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3' and deleted_at is null and revision = 3)$$,
  $$values (2::bigint, 1::bigint)$$,
  'folder recovery restores the matching deletion batch and advances note revisions'
);

select lives_ok(
  $$insert into public.folders (id, owner_id, name)
    values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', '11111111-1111-4111-8111-111111111111', 'Deleted parent');
    select public.set_folder_deleted('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', true)$$,
  'a deleted parent fixture can be created'
);

select throws_ok(
  $$insert into public.folders (owner_id, parent_id, name)
    values ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 'Invalid child')$$,
  '23503',
  null,
  'new folders cannot be placed under a deleted parent'
);

insert into public.folders (id, owner_id, name)
values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc6', '11111111-1111-4111-8111-111111111111', 'Restore conflict');
select public.set_folder_deleted('cccccccc-cccc-4ccc-8ccc-ccccccccccc6', true);
insert into public.folders (owner_id, name)
values ('11111111-1111-4111-8111-111111111111', 'Restore conflict');

select results_eq(
  $$select public.set_folder_deleted('cccccccc-cccc-4ccc-8ccc-ccccccccccc6', false)$$,
  array['conflict'::text],
  'folder recovery refuses an active sibling-name conflict'
);
select * from finish();
rollback;
