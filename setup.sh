#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=""
profile=""
port=""
force=1
skip_serve_check=0
launch_codex=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      project="${2:-}"
      shift 2
      ;;
    --profile)
      profile="${2:-}"
      shift 2
      ;;
    --port)
      port="${2:-}"
      shift 2
      ;;
    --no-force)
      force=0
      shift
      ;;
    --skip-serve-check)
      skip_serve_check=1
      shift
      ;;
    --launch-codex)
      launch_codex=1
      shift
      ;;
    --help|-h)
      cat <<'EOF'
Usage: ./setup.sh [options]

Options:
  --project <path>       Target client project directory. Prompts when omitted.
  --profile <name>       KFC rules profile for bootstrap.
  --port <n>             Forwarded KFC bootstrap port.
  --no-force             Disable force bootstrap.
  --skip-serve-check     Skip bootstrap serve-health checks.
  --launch-codex         Allow Codex auto-launch after bootstrap.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH." >&2
  exit 1
fi

if [ -z "$project" ]; then
  printf "Client project path: "
  IFS= read -r project
fi

if [ -z "$project" ]; then
  echo "Client project path is required." >&2
  exit 1
fi

set -- run client:link-bootstrap -- --project "$project" --force

if [ "$force" -eq 0 ]; then
  set -- run client:link-bootstrap -- --project "$project" --no-force
fi

if [ -n "$profile" ]; then
  set -- "$@" --profile "$profile"
fi

if [ -n "$port" ]; then
  set -- "$@" --port "$port"
fi

if [ "$skip_serve_check" -eq 1 ]; then
  set -- "$@" --skip-serve-check
fi

if [ "$launch_codex" -eq 1 ]; then
  set -- "$@" --launch-codex
fi

cd "$repo_root"
exec npm "$@"
