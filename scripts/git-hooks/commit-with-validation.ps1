Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Output "Validate commit message and commit with sandbox-hook fallback."
  Write-Output ""
  Write-Output "Usage:"
  Write-Output '  npm run commit:codex -- --message "feat(scope): summary" [git-commit-options...]'
  Write-Output ""
  Write-Output "Examples:"
  Write-Output '  npm run commit:codex -- --message "feat(flow): persist phase transitions"'
  Write-Output '  npm run commit:codex -- --message "fix(codex): tighten hook fallback" --signoff'
}

function Fail([string] $Message) {
  Write-Error "[commit:codex] $Message"
  exit 1
}

function Parse-Args([string[]] $RawArgs) {
  if ($RawArgs -contains "--help" -or $RawArgs -contains "-h") {
    Show-Help
    exit 0
  }

  $messageIndex = [Array]::IndexOf($RawArgs, "--message")
  if ($messageIndex -lt 0) {
    Fail 'Missing required flag: --message "type(scope): summary".'
  }

  if ($messageIndex + 1 -ge $RawArgs.Count) {
    Fail 'Missing value for --message. Example: --message "feat(flow): persist phase state".'
  }

  $message = $RawArgs[$messageIndex + 1]
  if ([string]::IsNullOrWhiteSpace($message)) {
    Fail "Commit message cannot be empty."
  }

  if ($message.StartsWith("--")) {
    Fail 'Missing value for --message. Example: --message "feat(flow): persist phase state".'
  }

  $passthrough = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $RawArgs.Count; $i += 1) {
    if ($i -eq $messageIndex -or $i -eq ($messageIndex + 1)) {
      continue
    }
    $passthrough.Add($RawArgs[$i])
  }

  if ($passthrough.Contains("-m") -or $passthrough.Contains("--message")) {
    Fail "Do not pass -m/--message in passthrough args. Use only one --message flag for this command."
  }

  return @{
    Message = $message
    Passthrough = @($passthrough)
  }
}

function Test-KnownHookFailure([string] $Text) {
  if ($Text -match "couldn't create signal pipe, Win32 error 5") {
    return $true
  }
  if ($Text -match "CreateFileMapping .*Win32 error 5") {
    return $true
  }
  return $false
}

function Invoke-GitCommit([string] $Message, [string[]] $Passthrough, [bool] $NoVerify) {
  $commitArgs = New-Object System.Collections.Generic.List[string]
  $commitArgs.Add("commit")
  if ($NoVerify) {
    $commitArgs.Add("--no-verify")
  }
  $commitArgs.Add("-m")
  $commitArgs.Add($Message)
  foreach ($arg in $Passthrough) {
    $commitArgs.Add($arg)
  }

  $output = & git @commitArgs 2>&1
  $code = $LASTEXITCODE
  foreach ($line in @($output)) {
    Write-Host $line
  }

  return [pscustomobject]@{
    ExitCode = $(if ($null -eq $code) { 1 } else { [int]$code })
    Text = (@($output) -join "`n")
  }
}

function Show-SemverImpact([string] $Message) {
  $json = & node "dist/scripts/release/semver-impact-from-message.js" --message $Message --json 2>&1
  if ($LASTEXITCODE -ne 0) {
    foreach ($line in @($json)) {
      Write-Host $line
    }
    Fail "Unable to compute semantic version impact for this commit."
  }

  $summary = (@($json) -join "`n") | ConvertFrom-Json
  Write-Host "[semver] Current version: $($summary.currentVersion)"
  Write-Host "[semver] Commit impact: $($summary.bump)"
  Write-Host "[semver] Suggested next release: $($summary.suggestedNextVersion)"
  $reasonSuffix = if ($summary.breaking) { "!" } else { "" }
  Write-Host "[semver] Reason: $($summary.type)$reasonSuffix"
}

function Get-ChangedPathsJson {
  $output = & git status --porcelain=v1 --untracked-files=all 2>&1
  if ($LASTEXITCODE -ne 0) {
    foreach ($line in @($output)) {
      Write-Host $line
    }
    throw "Unable to collect changed paths from git status."
  }

  $paths = New-Object System.Collections.Generic.List[string]
  foreach ($rawLine in @($output)) {
    $line = [string]$rawLine
    if ([string]::IsNullOrWhiteSpace($line) -or $line.Length -lt 4) {
      continue
    }

    $entry = $line.Substring(3).TrimEnd().Replace("\", "/")
    if ([string]::IsNullOrWhiteSpace($entry)) {
      continue
    }

    $resolved = if ($entry.Contains(" -> ")) { ($entry -split " -> ")[-1] } else { $entry }
    if (
      $resolved.StartsWith(".local/") -or
      $resolved.StartsWith(".kfc/") -or
      $resolved.StartsWith(".agents/")
    ) {
      continue
    }

    if (-not $paths.Contains($resolved)) {
      $paths.Add($resolved)
    }
  }

  return (@($paths) | ConvertTo-Json -Compress)
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $repoRoot

$parsed = Parse-Args -RawArgs @($args)
$message = [string] $parsed.Message
$passthrough = [string[]] $parsed.Passthrough

& npm run build:scripts
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& node "dist/scripts/git-hooks/commit-msg.js" --message $message
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Show-SemverImpact -Message $message

& npm run docs:sync
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$previousChangedPaths = $env:KFC_CHANGED_PATHS_JSON
$restoreChangedPaths = $false
try {
  $env:KFC_CHANGED_PATHS_JSON = Get-ChangedPathsJson
  $restoreChangedPaths = $true
} catch {
  Write-Warning "[commit:codex] Unable to precompute changed paths for docs-freshness verification. Falling back to verifier Git inspection."
}

try {
  & npm run verify:governance
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  if ($restoreChangedPaths) {
    if ($null -ne $previousChangedPaths) {
      $env:KFC_CHANGED_PATHS_JSON = $previousChangedPaths
    } else {
      Remove-Item Env:KFC_CHANGED_PATHS_JSON -ErrorAction SilentlyContinue
    }
  }
}

$firstAttempt = Invoke-GitCommit -Message $message -Passthrough $passthrough -NoVerify:$false
if ($firstAttempt.ExitCode -eq 0) {
  exit 0
}

if (-not (Test-KnownHookFailure -Text $firstAttempt.Text)) {
  exit ([int]$firstAttempt.ExitCode)
}

Write-Warning "[commit:codex] Detected known Git hook runtime error in this environment. Retrying with --no-verify after message validation."

$fallbackAttempt = Invoke-GitCommit -Message $message -Passthrough $passthrough -NoVerify:$true
if ($fallbackAttempt.ExitCode -eq 0) {
  Write-Warning "[commit:codex] Fallback commit succeeded with --no-verify."
  exit 0
}

exit ([int]$fallbackAttempt.ExitCode)
