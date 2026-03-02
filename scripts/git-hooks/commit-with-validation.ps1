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

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $repoRoot

$parsed = Parse-Args -RawArgs @($args)
$message = [string] $parsed.Message
$passthrough = [string[]] $parsed.Passthrough

& node "scripts/git-hooks/commit-msg.mjs" --message $message
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
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
