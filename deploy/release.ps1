param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [switch]$SkipBackups,
  [switch]$SkipTag
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$composeArgs = @('--env-file', '.env.production', '-f', 'docker-compose.production.yml')

if (-not (Test-Path ".git")) {
  throw "This folder is not a Git repository. Initialize Git first."
}

$status = git status --porcelain
if ($status) {
  throw "Working tree is not clean. Commit or stash changes before preparing a release."
}

if (-not (Test-Path ".env.production")) {
  throw ".env.production is required for release backups."
}

function Get-DotEnvMap {
  param([string]$Path)

  $values = @{}
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    $pair = $trimmed -split '=', 2
    if ($pair.Count -ne 2) {
      continue
    }

    $key = $pair[0].Trim()
    $value = $pair[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

$envValues = Get-DotEnvMap ".env.production"
$requiredKeys = @(
  'APP_DOMAIN',
  'PUBLIC_API_URL',
  'CLIENT_ORIGIN',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'METRICS_TOKEN'
)

foreach ($key in $requiredKeys) {
  if (-not $envValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envValues[$key])) {
    throw ".env.production is missing required value: $key"
  }
}

$dockerInfo = docker info 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Docker is not available. Start Docker Desktop or the Docker daemon before preparing a release."
}

$releaseDir = Join-Path "deploy" "releases"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$backupDir = Join-Path "deploy" "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$manifestPath = Join-Path $releaseDir "$Version.txt"
$commit = git rev-parse HEAD
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"

@(
  "version=$Version"
  "commit=$commit"
  "prepared_at=$timestamp"
) | Set-Content $manifestPath

if (-not $SkipBackups) {
  $dbServiceState = docker compose @composeArgs ps --status running --services db
  $apiServiceState = docker compose @composeArgs ps --status running --services api
  if (($dbServiceState -notcontains 'db') -or ($apiServiceState -notcontains 'api')) {
    throw "Production db and api containers must be running before release backups can be created."
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $dbBackupName = "mto-$Version-$stamp.dump"
  $uploadsBackupName = "uploads-$Version-$stamp.tar.gz"
  $dbTmpPath = "/tmp/$dbBackupName"
  $uploadsTmpPath = "/tmp/$uploadsBackupName"
  $dbBackupPath = Join-Path $backupDir $dbBackupName
  $uploadsBackupPath = Join-Path $backupDir $uploadsBackupName
  $dbContainerId = (docker compose @composeArgs ps -q db).Trim()
  $apiContainerId = (docker compose @composeArgs ps -q api).Trim()

  Write-Host "Creating database backup for release $Version..."
  docker compose @composeArgs exec -T db sh -lc "pg_dump -U ""$($envValues['POSTGRES_USER'])"" -d ""$($envValues['POSTGRES_DB'])"" -Fc -f ""$dbTmpPath"""
  if ($LASTEXITCODE -ne 0) {
    throw "Database backup failed."
  }
  docker cp "${dbContainerId}:$dbTmpPath" $dbBackupPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy database backup from the db container."
  }
  docker compose @composeArgs exec -T db rm -f $dbTmpPath | Out-Null

  Write-Host "Creating uploads backup for release $Version..."
  docker compose @composeArgs exec -T api sh -lc "mkdir -p /app/uploads && tar -czf ""$uploadsTmpPath"" -C /app/uploads ."
  if ($LASTEXITCODE -ne 0) {
    throw "Uploads backup failed."
  }
  docker cp "${apiContainerId}:$uploadsTmpPath" $uploadsBackupPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy uploads backup from the api container."
  }
  docker compose @composeArgs exec -T api rm -f $uploadsTmpPath | Out-Null

  Add-Content $manifestPath "db_backup=$dbBackupName"
  Add-Content $manifestPath "uploads_backup=$uploadsBackupName"
}

if (-not $SkipTag) {
  git tag -a $Version -m "Release $Version"
}

Write-Host "Release prepared."
Write-Host "Manifest: $manifestPath"
if (-not $SkipTag) {
  Write-Host "Tag created: $Version"
}
