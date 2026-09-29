import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtimeDirectory = join(root, '.dev-stack');
const dockerEnvironment = {
  ...process.env,
  DOCKER_HOST: `unix://${join(homedir(), '.config/colima/supabase/docker.sock')}`,
  DOCKER_CONFIG: '/tmp/note-taking-app-docker',
};
const excludedSupabaseServices = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';

type ServiceName = 'api' | 'web';

interface ServiceDefinition {
  name: ServiceName;
  command: string;
  args: string[];
  healthUrl: string;
  processMarker: string;
}

const services: ServiceDefinition[] = [
  {
    name: 'api',
    command: process.execPath,
    args: ['--env-file-if-exists=.env', '--experimental-strip-types', '--watch', 'server/local.ts'],
    healthUrl: 'http://127.0.0.1:3001/api/health',
    processMarker: 'server/local.ts',
  },
  {
    name: 'web',
    command: join(root, 'node_modules/.bin/vite'),
    args: ['--host', '127.0.0.1'],
    healthUrl: 'http://127.0.0.1:5173',
    processMarker: 'vite',
  },
];

function run(command: string, args: string[], options: { capture?: boolean; allowFailure?: boolean } = {}): string {
  const result = spawnSync(command, args, {
    cwd: root,
    env: command === 'colima' ? process.env : dockerEnvironment,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? (result.stderr || result.stdout).trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return options.capture ? result.stdout : '';
}

function colimaIsRunning(): boolean {
  const result = spawnSync('colima', ['status', 'supabase'], { stdio: 'ignore' });
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
    throw new Error('Colima is required. Install it with `brew install colima`.');
  }
  return result.status === 0;
}

function pidPath(name: ServiceName): string {
  return join(runtimeDirectory, `${name}.pid`);
}

function logPath(name: ServiceName): string {
  return join(runtimeDirectory, `${name}.log`);
}

function readPid(name: ServiceName): number | null {
  try {
    const pid = Number.parseInt(readFileSync(pidPath(name), 'utf8'), 10);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function processIsRunning(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processBelongsToService(service: ServiceDefinition, pid: number | null): boolean {
  if (!processIsRunning(pid)) return false;
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.includes(service.processMarker);
}

function startService(service: ServiceDefinition): void {
  const existingPid = readPid(service.name);
  if (processBelongsToService(service, existingPid)) return;
  rmSync(pidPath(service.name), { force: true });

  const logFile = openSync(logPath(service.name), 'w');
  const child = spawn(service.command, service.args, {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: ['ignore', logFile, logFile],
  });
  closeSync(logFile);
  if (!child.pid) throw new Error(`Failed to start the local ${service.name} service.`);
  writeFileSync(pidPath(service.name), `${child.pid}\n`, { mode: 0o600 });
  child.unref();
}

async function stopService(name: ServiceName): Promise<void> {
  const service = services.find((candidate) => candidate.name === name);
  if (!service) return;
  const pid = readPid(name);
  if (!processBelongsToService(service, pid)) {
    if (processIsRunning(pid)) console.warn(`Ignored stale ${name} PID ${pid}; it belongs to another process.`);
    rmSync(pidPath(name), { force: true });
    return;
  }

  process.kill(-pid!, 'SIGTERM');
  for (let attempt = 0; attempt < 20 && processBelongsToService(service, pid); attempt += 1) await delay(100);
  if (processBelongsToService(service, pid)) process.kill(-pid!, 'SIGKILL');
  rmSync(pidPath(name), { force: true });
}

async function endpointIsHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForEndpoint(name: string, url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await endpointIsHealthy(url)) return;
    await delay(500);
  }
  throw new Error(`${name} did not become healthy at ${url}. Run \`npm run dev:logs\` for details.`);
}

function parseSupabaseEnvironment(output: string): Record<string, string> {
  return Object.fromEntries(output.split('\n').flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    return match ? [[match[1], match[2].replace(/"$/, '')]] : [];
  }));
}

function setEnvironmentValue(source: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
}

function configureLocalEnvironment(): void {
  const values = parseSupabaseEnvironment(run('npx', ['supabase', 'status', '-o', 'env'], { capture: true }));
  if (!values.API_URL || !values.ANON_KEY) throw new Error('Supabase did not report its local API URL and publishable key.');

  const environmentPath = join(root, '.env');
  const examplePath = join(root, '.env.example');
  let source = existsSync(environmentPath) ? readFileSync(environmentPath, 'utf8') : readFileSync(examplePath, 'utf8');
  const replacements = {
    SUPABASE_URL: values.API_URL,
    SUPABASE_ANON_KEY: values.ANON_KEY,
    VITE_SUPABASE_URL: values.API_URL,
    VITE_SUPABASE_ANON_KEY: values.ANON_KEY,
    RELEASE_SHA: 'development',
    LOCAL_DISABLE_MFA: 'true',
    VITE_LOCAL_DISABLE_MFA: 'true',
  };
  for (const [key, value] of Object.entries(replacements)) source = setEnvironmentValue(source, key, value);
  writeFileSync(environmentPath, source, { mode: 0o600 });
}

function provisionLocalTestUser(): void {
  const containerId = run('docker', [
    'ps',
    '--filter',
    'name=supabase_db_note-taking-app',
    '--format',
    '{{.ID}}',
  ], { capture: true }).trim();
  if (!containerId) throw new Error('The local Supabase database container is unavailable.');

  const sql = `
    update auth.users
    set
      email = 'test@gmail.com',
      encrypted_password = extensions.crypt('12345', extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
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
    )
    on conflict (provider_id, provider) do update
    set
      user_id = excluded.user_id,
      identity_data = excluded.identity_data,
      updated_at = now();
  `;
  run('docker', [
    'exec',
    containerId,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ], { capture: true });
}

async function up(): Promise<void> {
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  if (!existsSync(join(root, 'node_modules/.bin/vite'))) throw new Error('Dependencies are missing. Run `npm ci` first.');

  if (!colimaIsRunning()) {
    console.log('Starting the Colima supabase profile...');
    run('colima', ['start', 'supabase']);
  }
  console.log('Starting local Supabase...');
  run('npx', ['supabase', 'start', '--exclude', excludedSupabaseServices], { capture: true });
  configureLocalEnvironment();
  provisionLocalTestUser();

  try {
    for (const service of services) startService(service);
    await Promise.all([
      waitForEndpoint('Supabase Auth', 'http://127.0.0.1:54321/auth/v1/health'),
      ...services.map((service) => waitForEndpoint(service.name, service.healthUrl)),
    ]);
  } catch (error) {
    await Promise.all(services.map((service) => stopService(service.name)));
    throw error;
  }

  console.log('Local Notes is ready at http://127.0.0.1:5173');
}

async function down(): Promise<void> {
  await Promise.all(services.map((service) => stopService(service.name)));
  if (colimaIsRunning()) {
    run('npx', ['supabase', 'stop']);
    run('colima', ['stop', 'supabase']);
  }
  console.log('Local Notes is stopped. Supabase data was preserved.');
}

async function status(): Promise<void> {
  const checks = await Promise.all([
    endpointIsHealthy('http://127.0.0.1:54321/auth/v1/health'),
    ...services.map((service) => endpointIsHealthy(service.healthUrl)),
  ]);
  const rows = [
    ['Colima', colimaIsRunning()],
    ['Supabase', checks[0]],
    ['API', checks[1] && processBelongsToService(services[0], readPid('api'))],
    ['Web', checks[2] && processBelongsToService(services[1], readPid('web'))],
  ] as const;
  for (const [name, healthy] of rows) console.log(`${name.padEnd(8)} ${healthy ? 'running' : 'stopped'}`);
}

function logs(): void {
  for (const service of services) {
    console.log(`\n== ${service.name} ==`);
    try {
      const lines = readFileSync(logPath(service.name), 'utf8').trimEnd().split('\n');
      console.log(lines.slice(-80).join('\n'));
    } catch {
      console.log('No log output yet.');
    }
  }
}

const command = process.argv[2];
switch (command) {
  case 'up':
    await up();
    break;
  case 'down':
    await down();
    break;
  case 'status':
    await status();
    break;
  case 'logs':
    logs();
    break;
  default:
    console.error('Usage: dev-stack.ts <up|down|status|logs>');
    process.exitCode = 1;
}
