#!/usr/bin/env bash
# Deployment helper for the Hetzner VPS.
# Wraps `docker compose --env-file .env.local` and adds pull/build/health flow.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
COMPOSE=(docker compose --env-file "$ENV_FILE")

color() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info() { color "1;34" "==> $1"; }
ok()   { color "1;32" "✓ $1"; }
warn() { color "1;33" "! $1"; }
fail() { color "1;31" "✗ $1" >&2; exit 1; }

require_env_file() {
  [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found at $(pwd). Upload it before deploying."
}

check_required_vars() {
  local required=(
    EXPO_PUBLIC_API_URL
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    EXPO_PUBLIC_CONVEX_URL
    CLERK_SECRET_KEY
    CONVEX_URL
    API_SERVICE_SECRET
    TOKEN_ENCRYPTION_KEY
    OAUTH_STATE_SECRET
  )
  local missing=()
  for var in "${required[@]}"; do
    grep -E "^${var}=" "$ENV_FILE" >/dev/null 2>&1 || missing+=("$var")
  done
  if (( ${#missing[@]} > 0 )); then
    warn "Missing keys in $ENV_FILE: ${missing[*]}"
    warn "Continuing anyway — fix before going live if these are required."
  fi
}

cmd_pull() {
  info "git pull"
  git pull --ff-only
  ok "repo up to date"
}

cmd_build() {
  require_env_file
  info "building images"
  "${COMPOSE[@]}" build "$@"
  ok "images built"
}

cmd_up() {
  require_env_file
  info "starting containers"
  "${COMPOSE[@]}" up -d "$@"
  ok "containers running"
}

cmd_down() {
  info "stopping containers"
  "${COMPOSE[@]}" down "$@"
  ok "containers stopped"
}

cmd_restart() {
  require_env_file
  "${COMPOSE[@]}" restart "$@"
  ok "restarted"
}

cmd_logs() {
  "${COMPOSE[@]}" logs -f --tail=100 "$@"
}

cmd_ps() {
  "${COMPOSE[@]}" ps
}

cmd_health() {
  info "waiting for api /health"
  local url="http://127.0.0.1:4000/health"
  for _ in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      ok "api healthy ($url)"
      return 0
    fi
    sleep 2
  done
  fail "api did not become healthy within 60s — check 'deploy.sh logs api'"
}

cmd_deploy() {
  require_env_file
  check_required_vars
  cmd_pull
  cmd_build
  cmd_up
  cmd_health
  ok "deploy complete"
  cmd_ps
}

usage() {
  cat <<EOF
Usage: scripts/deploy.sh <command>

Commands:
  deploy        pull → build → up → health-check (default)
  build [svc]   docker compose build
  up    [svc]   docker compose up -d
  down          docker compose down
  restart [svc] docker compose restart
  logs    [svc] tail logs
  ps            list services
  health        poll api /health until healthy
  help          this message

All commands run with --env-file $ENV_FILE.
EOF
}

main() {
  local cmd="${1:-deploy}"
  shift || true
  case "$cmd" in
    deploy)  cmd_deploy "$@" ;;
    build)   cmd_build "$@" ;;
    up)      cmd_up "$@" ;;
    down)    cmd_down "$@" ;;
    restart) cmd_restart "$@" ;;
    logs)    cmd_logs "$@" ;;
    ps)      cmd_ps "$@" ;;
    health)  cmd_health ;;
    help|-h|--help) usage ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
