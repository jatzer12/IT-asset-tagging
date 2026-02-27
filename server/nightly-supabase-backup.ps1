param(
  [string]$BackupDir = "$PSScriptRoot\..\backups",
  [int]$RetentionDays = 30,
  [string]$PgDumpPath = "pg_dump.exe",
  [string]$DbUrl = $env:SUPABASE_DB_URL
)

$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$timestamp] $Message"
}

if (-not $DbUrl) {
  throw "SUPABASE_DB_URL is required. Set it as environment variable or pass -DbUrl."
}

if (-not (Get-Command $PgDumpPath -ErrorAction SilentlyContinue)) {
  throw "pg_dump not found. Install PostgreSQL client tools and ensure pg_dump.exe is in PATH, or pass -PgDumpPath."
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $BackupDir ("supabase-backup-" + $stamp + ".dump")
$logFile = Join-Path $BackupDir ("backup-log-" + (Get-Date -Format "yyyyMMdd") + ".txt")

Write-Log "Starting Supabase backup..." | Tee-Object -FilePath $logFile -Append
Write-Log "Output: $backupFile" | Tee-Object -FilePath $logFile -Append

# Custom format for reliable restore with pg_restore
& $PgDumpPath `
  --dbname="$DbUrl" `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file="$backupFile" 2>&1 | Tee-Object -FilePath $logFile -Append

if (-not (Test-Path $backupFile)) {
  throw "Backup failed: output file was not created."
}

$sizeMb = [math]::Round((Get-Item $backupFile).Length / 1MB, 2)
Write-Log "Backup completed successfully. Size: $sizeMb MB" | Tee-Object -FilePath $logFile -Append

# Retention cleanup
$cutoff = (Get-Date).AddDays(-1 * [math]::Abs($RetentionDays))
$oldBackups = Get-ChildItem -Path $BackupDir -Filter "supabase-backup-*.dump" -File |
  Where-Object { $_.LastWriteTime -lt $cutoff }

foreach ($file in $oldBackups) {
  Write-Log "Deleting old backup: $($file.FullName)" | Tee-Object -FilePath $logFile -Append
  Remove-Item -Path $file.FullName -Force
}

Write-Log "Backup job finished." | Tee-Object -FilePath $logFile -Append
