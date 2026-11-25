SMARTBIZ CLOUD CONNECTION PATCH

This patch uses the synchronization engine and Dexie v9 schema from the original SmartBiz source ZIP.
It retains the current App.jsx and current src/lib/supabase.js. It replaces the existing CloudReadPanel with a screen that can run the two-way merge across all 11 business tables.

Install:
1. Extract this ZIP to a folder on your Windows PC.
2. Open PowerShell in the extracted folder.
3. Run: powershell -ExecutionPolicy Bypass -File .\INSTALL.ps1

The installer backs up src/db.js, src/CloudReadPanel.jsx and existing sync files in a timestamped folder inside smartbiz-publish before replacing them.
It then runs npm run build.

Important:
- The engine stops on detected conflicts, invalid IDs, missing relationships, and pending deletions.
- It does not overwrite existing cloud records or delete cloud/local records.
- Run sync from Cloud Sync only after the build succeeds.
