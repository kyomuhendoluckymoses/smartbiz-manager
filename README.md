# SmartBiz Manager

This ZIP contains the SmartBiz Manager application. The **canonical application is in `frontend/`**. The old root-level `src/` folder is retained as a historical copy and is not the application entry point.

## Start on Windows

1. Install Node.js 20.19 or newer (Node.js 22 or 24 is suitable).
2. Extract this ZIP.
3. Double-click `START-WINDOWS.bat`.

The launcher installs the exact locked dependencies from `frontend/package-lock.json`, then starts the application at `http://localhost:5173`.

You can also run these commands from this folder:

```powershell
npm run setup
npm run dev
```

## Production / Vercel

Set the Vercel project Root Directory to `frontend`.

Build command:

```powershell
npm run build
```

Output directory: `dist`

The frontend needs these Vite environment variables in Vercel (Production and Preview as appropriate):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The uploaded project includes its existing local `frontend/.env` so the configured Supabase project is retained for local use. Do not publish private service-role keys. A Supabase publishable/anon key is designed for browser use; database security must be enforced by Row Level Security policies.

## Data synchronization

The app stores operational data locally with Dexie and synchronizes records through the Supabase `business_records` table after owner authentication. Devices must use the same deployed app, Supabase project, owner account/business membership, and online connection to converge on the same records. The sync engine uses timestamps and a deterministic tie-breaker for same-timestamp edits.

**Important:** The ZIP does not contain your hosted Supabase database or its RLS policies. Those live in your Supabase project. This package cannot independently verify or repair hosted schema, policies, account credentials, or existing cloud records while offline from that service. Keep your existing database and backups; do not reset the database as part of setup.

## Safety

- Do not delete the original project folder or existing database backups until you have confirmed the same records appear on both devices.
- Never share your owner password or Supabase service-role key.
