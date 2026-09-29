# Notes

Private Markdown notebook backed by Supabase. React/Vite serves the browser UI; Hono serves `/api/*`.

## Local development

Use Node 22 and install Colima:

```sh
npm ci
npm run dev:up
```

`dev:up` starts the dedicated Colima `supabase` profile, local Supabase, the Node/Hono API, and Vite. It updates the ignored `.env` file with local Supabase values, waits for every service to become healthy, and then returns. Open `http://127.0.0.1:5173`.

Sign in locally with `test@gmail.com` and password `12345`. `dev:up` provisions this account and disables MFA only while both the browser and API use loopback Supabase URLs. Production continues to require MFA; either local bypass flag fails closed against a non-loopback Supabase URL.

```sh
npm run dev:status
npm run dev:logs
npm run dev:down
```

`dev:down` stops the application and Colima while preserving local Supabase data. Use `npm run dev:all` only when Supabase is already running and you want the API and Vite attached to the current terminal.

`npm run preview:cloudflare` builds the UI and runs the combined static/API artifact with Wrangler at `http://127.0.0.1:8787`. Wrangler reads ignored `.dev.vars` or `.env` bindings.

```sh
npm run check
```

`npm run db:check` reconstructs and tests the selected **local disposable Supabase database**. It is destructive to that local database. It does not read, modify, move, or delete Markdown files.

## Production deployment

GitHub Actions owns production releases. Every merge to `main` is serialized and performs:

1. The complete quality gate.
2. A production migration dry run.
3. Pending forward migrations.
4. A Vite build and Cloudflare deployment of the exact Git SHA.
5. Unauthenticated production smoke checks.

Do not enable Cloudflare Git integration; a second deployment owner could race database migrations.

### One-time provider configuration

1. In Cloudflare, create/select the account and its `workers.dev` subdomain.
2. Create an API token limited to **Account → Workers Scripts → Edit** for that account.
3. In GitHub, create a `production` environment restricted to `main`.
4. Add the environment variable `SUPABASE_URL`.
5. Add these environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `SUPABASE_DB_URL` (the percent-encoded Session pooler connection URI)
   - `SUPABASE_ANON_KEY` (the publishable key despite the legacy name)
6. Keep public registration disabled in Supabase.
7. After the first deployment, optionally add `ESV_API_KEY` as an encrypted Worker secret in Cloudflare.

The server and browser receive the same Supabase URL and publishable key from the GitHub `production` environment. Production migrations connect through the Session pooler URI without requiring a Supabase Management API token. Passwords, database credentials, TOTP material, recovery codes, and service-role keys must never be committed or added to Vite-prefixed variables.

### Recovery

- Application regression: use Cloudflare deployment rollback to restore a known-good Worker version.
- Schema regression: add a corrective forward migration; do not reverse a migration against live data.
- Suspected corruption: stop writes, preserve the affected database, restore into a separate environment, validate notes, then repair production.
- Before destructive migrations, take an external encrypted database dump and a complete Markdown ZIP export.
