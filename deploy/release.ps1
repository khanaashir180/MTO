param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [switch]$SkipBackups,
  [switch]$SkipTag
)

$ErrorActionPreference = 'Stop'

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

$releaseDir = Join-Path "deploy" "releases"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$manifestPath = Join-Path $releaseDir "$Version.txt"
$commit = git rev-parse HEAD
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"

@(
  "version=$Version"
  "commit=$commit"
  "prepared_at=$timestamp"
) | Set-Content $manifestPath

if (-not $SkipBackups) {
  Write-Host "Creating database backup for release $Version..."
  cmd /c "set RELEASE_VERSION=$Version && set /p POSTGRES_USER=<nul && bash ./deploy/backup-db.sh" | Out-Null
  Write-Host "Creating uploads backup for release $Version..."
  cmd /c "set RELEASE_VERSION=$Version && bash ./deploy/backup-uploads.sh" | Out-Null
}

if (-not $SkipTag) {
  git tag -a $Version -m "Release $Version"
}

Write-Host "Release prepared."
Write-Host "Manifest: $manifestPath"
if (-not $SkipTag) {
  Write-Host "Tag created: $Version"
}
