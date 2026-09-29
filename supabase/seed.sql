insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alice@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Alice Example"}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bob@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Bob Example"}'::jsonb,
    now(),
    now()
  );

update auth.users
set
  email = 'test@gmail.com',
  encrypted_password = extensions.crypt('12345', extensions.gen_salt('bf')),
  raw_user_meta_data = '{"display_name":"Local Test User"}'::jsonb,
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change = '',
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111';

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"test@gmail.com","email_verified":true,"phone_verified":false}'::jsonb,
  'email',
  now(),
  now(),
  now()
);

insert into public.folders (id, owner_id, name)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'Projects'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '22222222-2222-4222-8222-222222222222',
    'Private'
  );

insert into public.notes (id, owner_id, folder_id, name, content)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'welcome.md',
    E'# Welcome\n\nThis is the local test account’s development note.\n'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'private.md',
    E'# Private\n\nThis note belongs to Bob.\n'
  );
