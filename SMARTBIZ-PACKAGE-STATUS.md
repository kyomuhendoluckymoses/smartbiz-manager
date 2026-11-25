# SmartBiz Manager package status

## Included corrections
- Identified `frontend/` as the only canonical Supabase-enabled application.
- Root npm commands now delegate to the canonical frontend, avoiding accidentally starting the older root-level local-only copy.
- Added a Windows launcher that installs locked dependencies and starts the app.
- Hardened initial Supabase session loading so a rejected session check does not leave the app permanently on its loading screen.
- Added deterministic conflict resolution when two devices have different edits with identical timestamps.

## Verification limits
A full production build and live two-device sync test could not be completed in the preparation environment: npm package downloads and DNS access to the configured Supabase host were unavailable. The archive can be checked locally, but the hosted Supabase schema, RLS policies, owner login, and live records cannot be certified from this source ZIP alone. No claim of fully working production synchronization is made until those live checks pass.

The original local database backups and existing app features are retained. Do not reset the Supabase database or delete existing local data during setup.
