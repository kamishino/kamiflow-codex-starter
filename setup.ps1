param(
  [string]$Project = "",
  [string]$Profile = "",
  [int]$Port = 0,
  [switch]$NoForce,
  [switch]$SkipServeCheck,
  [switch]$LaunchCodex
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$npmCommand = Get-Command npm -ErrorAction SilentlyContinue

if (-not $npmCommand) {
  Write-Error "npm is required but was not found in PATH."
}

$npmExecutable = $npmCommand.Source
$npmCmdCandidate = Join-Path (Split-Path -Parent $npmExecutable) "npm.cmd"
if (Test-Path $npmCmdCandidate) {
  $npmExecutable = $npmCmdCandidate
}

if ([string]::IsNullOrWhiteSpace($Project)) {
  $Project = Read-Host "Client project path"
}

if ([string]::IsNullOrWhiteSpace($Project)) {
  throw "Client project path is required."
}

$argsList = @("run", "client:link-bootstrap", "--", "--project", $Project)
if (-not $NoForce) {
  $argsList += "--force"
}
if (-not [string]::IsNullOrWhiteSpace($Profile)) {
  $argsList += @("--profile", $Profile)
}
if ($Port -gt 0) {
  $argsList += @("--port", $Port.ToString())
}
if ($SkipServeCheck) {
  $argsList += "--skip-serve-check"
}
if ($LaunchCodex) {
  $argsList += "--launch-codex"
}

Push-Location $repoRoot
try {
  & $npmExecutable @argsList
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
