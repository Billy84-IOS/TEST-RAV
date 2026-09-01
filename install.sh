#!/usr/bin/env bash
# ==================================================================
#  HACKLAB — installation sur un VPS Ubuntu / Debian
#  Usage :  sudo bash install.sh
# ==================================================================
#  Met en place :
#   - Docker + le labo de cibles vulnérables (Juice Shop, DVWA, WebGoat)
#   - Les outils de pentest en ligne de commande
#   - ttyd (terminal web) et le tableau de bord, en services systemd
#
#  Les cibles vulnérables sont liées à 127.0.0.1 : elles ne sont PAS
#  exposées sur Internet. On les attaque depuis le VPS lui-même.
# ==================================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASH_PORT="${PORT:-8000}"
TTYD_PORT="${TTYD_PORT:-7681}"
RUN_USER="${SUDO_USER:-root}"

say()  { printf '\033[1;36m[hacklab]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[hacklab]\033[0m %s\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Lance ce script avec sudo :  sudo bash install.sh" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Ce script est prévu pour Ubuntu / Debian (apt)." >&2
  exit 1
fi

# ------------------------------------------------------------------
say "Mise à jour des paquets et prérequis…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw

# ------------------------------------------------------------------
say "Installation de Node.js (si absent)…"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
say "Node : $(node --version)"

# ------------------------------------------------------------------
say "Installation de Docker (si absent)…"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
if [[ "$RUN_USER" != "root" ]]; then
  usermod -aG docker "$RUN_USER" || true
fi

# ------------------------------------------------------------------
say "Installation des outils de pentest (ceux disponibles via apt)…"
# On tente chaque paquet ; on continue si l'un manque sur la distribution.
TOOLS=(nmap nikto hydra john sqlmap gobuster ffuf whatweb dirb wordlists seclists ttyd)
for pkg in "${TOOLS[@]}"; do
  if apt-get install -y "$pkg" >/dev/null 2>&1; then
    printf '  \033[1;32m✓\033[0m %s\n' "$pkg"
  else
    printf '  \033[1;33m—\033[0m %s (indisponible via apt, à installer à la main si besoin)\n' "$pkg"
  fi
done

# nuclei n'est pas dans apt : binaire Go officiel.
if ! command -v nuclei >/dev/null 2>&1; then
  say "Installation de nuclei (binaire officiel)…"
  ARCH="$(dpkg --print-architecture)"
  case "$ARCH" in
    amd64) NARCH="linux_amd64" ;;
    arm64) NARCH="linux_arm64" ;;
    *)     NARCH="" ;;
  esac
  if [[ -n "$NARCH" ]]; then
    NVER="$(curl -fsSL https://api.github.com/repos/projectdiscovery/nuclei/releases/latest | grep -oP '"tag_name":\s*"v\K[^"]+' || echo '')"
    if [[ -n "$NVER" ]]; then
      TMP="$(mktemp -d)"
      if curl -fsSL "https://github.com/projectdiscovery/nuclei/releases/download/v${NVER}/nuclei_${NVER}_${NARCH}.zip" -o "$TMP/n.zip"; then
        apt-get install -y unzip >/dev/null 2>&1 || true
        unzip -o "$TMP/n.zip" -d "$TMP" >/dev/null 2>&1 && install -m 0755 "$TMP/nuclei" /usr/local/bin/nuclei && printf '  \033[1;32m✓\033[0m nuclei %s\n' "$NVER"
      fi
      rm -rf "$TMP"
    fi
  fi
  command -v nuclei >/dev/null 2>&1 || warn "nuclei non installé — tu pourras le faire plus tard."
fi

# Certaines distributions installent seclists sous /usr/share/seclists, d'autres sous wordlists.
if [[ -d /usr/share/seclists ]]; then
  say "SecLists : /usr/share/seclists"
elif [[ -d /usr/share/wordlists/seclists ]]; then
  ln -sfn /usr/share/wordlists/seclists /usr/share/seclists
  say "SecLists relié à /usr/share/seclists"
fi

# ------------------------------------------------------------------
say "Démarrage du labo de cibles vulnérables (docker compose)…"
cd "$APP_DIR"
docker compose pull
docker compose up -d
docker compose ps

# ------------------------------------------------------------------
say "Configuration du terminal web (ttyd)…"
mkdir -p "$APP_DIR/data"
TTYD_CRED_FILE="$APP_DIR/data/ttyd-cred.txt"
if [[ ! -f "$TTYD_CRED_FILE" ]]; then
  TTYD_PASS="$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
  echo "hacklab:${TTYD_PASS}" > "$TTYD_CRED_FILE"
  chmod 600 "$TTYD_CRED_FILE"
fi
TTYD_CRED="$(cat "$TTYD_CRED_FILE")"

if command -v ttyd >/dev/null 2>&1; then
  cat > /etc/systemd/system/hacklab-ttyd.service <<UNIT
[Unit]
Description=HACKLAB terminal web (ttyd)
After=network.target

[Service]
Type=simple
# Lié à 127.0.0.1 : accessible seulement via le tableau de bord (proxy authentifié).
ExecStart=/usr/bin/ttyd -p ${TTYD_PORT} -i 127.0.0.1 -c ${TTYD_CRED} -W bash
Restart=always
User=${RUN_USER}

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now hacklab-ttyd
  say "Terminal web actif (127.0.0.1:${TTYD_PORT})."
else
  warn "ttyd absent : l'onglet Terminal ne marchera pas tant qu'il n'est pas installé."
fi

# ------------------------------------------------------------------
say "Configuration du tableau de bord (service systemd)…"
cat > /etc/systemd/system/hacklab.service <<UNIT
[Unit]
Description=HACKLAB tableau de bord
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/env node ${APP_DIR}/server.js
Environment=PORT=${DASH_PORT}
Environment=TTYD_PORT=${TTYD_PORT}
Restart=always
User=${RUN_USER}
SupplementaryGroups=docker

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now hacklab

# ------------------------------------------------------------------
say "Pare-feu : on n'ouvre QUE le tableau de bord (les cibles restent privées)…"
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow "${DASH_PORT}/tcp" >/dev/null 2>&1 || true
warn "Active le pare-feu quand tu es prêt :  sudo ufw enable"

sleep 2
IP="$(curl -fsSL https://api.ipify.org 2>/dev/null || echo 'IP_DU_VPS')"

echo
echo "=================================================================="
say  "Installation terminée."
echo "  Tableau de bord :  http://${IP}:${DASH_PORT}"
if [[ -f "$APP_DIR/data/mot-de-passe.txt" ]]; then
  echo "  Mot de passe    :  $(sed -n '3p' "$APP_DIR/data/mot-de-passe.txt")"
fi
echo
echo "  Depuis ton iPhone : ouvre cette adresse dans Safari,"
echo "  puis Partager → « Sur l'écran d'accueil » pour l'avoir comme une app."
echo
echo "  Change le mot de passe dès la première connexion (Réglages)."
echo "=================================================================="
