#!/usr/bin/env bash
# BayRadar one-line installer — POSIX-friendly bash
set -eu

REPO_URL="${BAYRADAR_REPO_URL:-https://github.com/ChrisKariofyllis/BayRadar.git}"
TARGET_DIR="${BAYRADAR_DIR:-}"
RED="$(printf '\033[31m')"
GRN="$(printf '\033[32m')"
YLW="$(printf '\033[33m')"
CYN="$(printf '\033[36m')"
BLD="$(printf '\033[1m')"
RST="$(printf '\033[0m')"

info() { printf '%s\n' "${CYN}$*${RST}"; }
warn() { printf '%s\n' "${YLW}$*${RST}"; }
fail() { printf '%s\n' "${RED}$*${RST}"; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

detect_compose() {
  if have docker && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  if have docker-compose; then
    echo "docker-compose"
    return 0
  fi
  return 1
}

lan_ip() {
  if have hostname; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [ -n "${ip:-}" ]; then
      printf '%s' "$ip"
      return
    fi
  fi
  if have ip; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
    if [ -n "${ip:-}" ]; then
      printf '%s' "$ip"
      return
    fi
  fi
  printf '127.0.0.1'
}

random_secret() {
  if have openssl; then
    openssl rand -hex 24
    return
  fi
  dd if=/dev/urandom bs=24 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
}

printf '%s\n' "${BLD}${CYN}"
cat <<'BANNER'
  ____              _____           _
 |  _ \            |  __ \         | |
 | |_) | __ _ _   _| |__) |__ _  __| | __ _ _ __
 |  _ < / _` | | | |  _  // _` |/ _` |/ _` | '__|
 | |_) | (_| | |_| | | \ \ (_| | (_| | (_| | |
 |____/ \__,_|\__, |_|  \_\__,_|\__,_|\__,_|_|
               __/ |
              |___/   Self-hosted eBay deal radar
BANNER
printf '%s\n' "${RST}"

if ! have docker; then
  fail "Docker is not installed. Install Docker Engine, then re-run this script."
fi

COMPOSE_CMD="$(detect_compose)" || fail "Docker Compose is not available. Install the Docker Compose plugin or docker-compose."

if [ -z "$TARGET_DIR" ]; then
  if [ -f "./docker-compose.yml" ] && [ -f "./package.json" ]; then
    TARGET_DIR="$(pwd)"
    info "Using current directory: $TARGET_DIR"
  else
    TARGET_DIR="${HOME}/bayradar"
  fi
fi

if [ -d "$TARGET_DIR/.git" ]; then
  info "Updating existing repository in $TARGET_DIR"
  git -C "$TARGET_DIR" pull --ff-only || warn "git pull failed; continuing with the local copy."
elif [ -f "$TARGET_DIR/docker-compose.yml" ]; then
  info "Found BayRadar files in $TARGET_DIR"
else
  if ! have git; then
    fail "git is required to clone BayRadar."
  fi
  info "Cloning BayRadar into $TARGET_DIR"
  git clone "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"

mkdir -p "$TARGET_DIR/prisma/data"

if [ ! -f .env ]; then
  SECRET="$(random_secret)"
  cat > .env <<EOF
APP_SECRET=${SECRET}
NODE_ENV=production
DATABASE_URL=file:/app/prisma/data/bayradar.db
EOF
  info "Wrote .env with a generated APP_SECRET."
else
  info "Keeping existing .env"
fi

info "Building and starting BayRadar…"
# shellcheck disable=SC2086
$COMPOSE_CMD up -d --build

IP="$(lan_ip)"

printf '%s\n' "${GRN}${BLD}"
cat <<'DONE'
  ____              _____           _
 |  _ \            |  __ \         | |
 | |_) | __ _ _   _| |__) |__ _  __| | __ _ _ __
 |  _ < / _` | | | |  _  // _` |/ _` |/ _` | '__|
 | |_) | (_| | |_| | | \ \ (_| | (_| | (_| | |
 |____/ \__,_|\__, |_|  \_\__,_|\__,_|\__,_|_|
               __/ |
              |___/
DONE
printf '%s\n' "${RST}"
printf '%s\n' "${GRN}${BLD}BayRadar is running!${RST}"
printf '%s\n' "  Dashboard:  ${BLD}http://localhost:3000${RST}"
if [ "$IP" != "127.0.0.1" ] && [ "$IP" != "::1" ]; then
  printf '%s\n' "  LAN:        ${BLD}http://${IP}:3000${RST}"
fi
printf '%s\n' ""
printf '%s\n' "Open the web dashboard and head to Settings to enter your eBay keys."
printf '%s\n' "Then create a monitor and hit Trigger Scan Now."
