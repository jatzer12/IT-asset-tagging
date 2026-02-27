param(
  [string]$TaskName = "PCC-Supabase-Nightly-Backup",
  [string]$RunAt = "01:00",
  [string]$BackupScriptPath = "$PSScriptRoot\nightly-supabase-backup.ps1",
  [string]$BackupDir = "$PSScriptRoot\..\backups",
  [int]$RetentionDays = 30,
  [string]$PgDumpPath = "pg_dump.exe",
  [string]$DbUrl = $env:SUPABASE_DB_URL
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupScriptPath)) {
  throw "Backup script not found at: $BackupScriptPath"
}

if (-not $DbUrl) {
  throw "SUPABASE_DB_URL is required. Set env var or pass -DbUrl."
}

$safeDbUrl = $DbUrl.Replace("'", "''")
$safeBackupDir = $BackupDir.Replace("'", "''")
$safePgDumpPath = $PgDumpPath.Replace("'", "''")
$safeScript = $BackupScriptPath.Replace("'", "''")

$arg = "-NoProfile -ExecutionPolicy Bypass -Command `"& { " +
  "$env:SUPABASE_DB_URL='$safeDbUrl'; " +
  "& '$safeScript' -BackupDir '$safeBackupDir' -RetentionDays $RetentionDays -PgDumpPath '$safePgDumpPath' }`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$trigger = New-ScheduledTaskTrigger -Daily -At $RunAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Nightly backup for Supabase Postgres database." `
  -Force | Out-Null

Write-Host "Scheduled task '$TaskName' created/updated. Runs daily at $RunAt."
Write-Host "To test now, run: Start-ScheduledTask -TaskName '$TaskName'"
