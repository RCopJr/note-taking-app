# Notes

Private Markdown notebook backed by Supabase. React/Vite serves the browser UI; Hono serves `/api/*`.

## Local development

Use Node 22 and copy `.env.example` to `.env` with local Supabase values.

```sh
npm ci
npm run dev:all
```

Vite runs at `http://127.0.0.1:5173` and proxies `/api/*` to the Node/Hono server at `http://127.0.0.1:3001`.

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
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_ANON_KEY` (the publishable key despite the legacy name)
6. Keep public registration disabled in Supabase.
7. After the first deployment, optionally add `ESV_API_KEY` as an encrypted Worker secret in Cloudflare.

The server and browser receive the same Supabase URL and publishable key from the GitHub `production` environment. Passwords, access tokens, database credentials, TOTP material, recovery codes, and service-role keys must never be committed or added to Vite-prefixed variables.

### Recovery

- Application regression: use Cloudflare deployment rollback to restore a known-good Worker version.
- Schema regression: add a corrective forward migration; do not reverse a migration against live data.
- Suspected corruption: stop writes, preserve the affected database, restore into a separate environment, validate notes, then repair production.
- Before destructive migrations, take an external encrypted database dump and a complete Markdown ZIP export.
