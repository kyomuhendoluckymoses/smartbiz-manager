$ErrorActionPreference = 'Stop'
$project = Join-Path $HOME 'Desktop\smartbiz-publish'
if (!(Test-Path (Join-Path $project 'src\App.jsx'))) { throw "Could not find $project\src\App.jsx" }
if (!(Test-Path (Join-Path $project 'src\lib\supabase.js'))) { throw "Missing src\lib\supabase.js. Keep your existing Supabase client file." }
$backup = Join-Path $project ("smartbiz-before-cloud-sync-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item (Join-Path $project 'src\db.js') $backup
Copy-Item (Join-Path $project 'src\CloudReadPanel.jsx') $backup
if (Test-Path (Join-Path $project 'src\lib\sync.js')) { Copy-Item (Join-Path $project 'src\lib\sync.js') $backup }
if (Test-Path (Join-Path $project 'src\lib\businessAccess.js')) { Copy-Item (Join-Path $project 'src\lib\businessAccess.js') $backup }
Copy-Item (Join-Path $PSScriptRoot 'src\db.js') (Join-Path $project 'src\db.js') -Force
Copy-Item (Join-Path $PSScriptRoot 'src\CloudReadPanel.jsx') (Join-Path $project 'src\CloudReadPanel.jsx') -Force
Copy-Item (Join-Path $PSScriptRoot 'src\lib\sync.js') (Join-Path $project 'src\lib\sync.js') -Force
Copy-Item (Join-Path $PSScriptRoot 'src\lib\businessAccess.js') (Join-Path $project 'src\lib\businessAccess.js') -Force
Write-Host "Cloud sync engine installed. Backup: $backup" -ForegroundColor Green
Set-Location $project
npm run build
