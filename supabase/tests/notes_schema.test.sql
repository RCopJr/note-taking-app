begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

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

select results_eq(
  $$select count(*) from public.notes$$,
  array[0::bigint],
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
  '42501',
  null,
  'a user cannot transfer a note to another owner'
);

select lives_ok(
  $$insert into public.notes (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'allowed.md')$$,
  'a user can create their own note'
);

select * from finish();
rollback;
