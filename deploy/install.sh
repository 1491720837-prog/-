#!/bin/zsh
# 把 Folio 在线版（必要时加上 cloudflared 隧道）装成 macOS 登录项。
#
#   ./deploy/install.sh            # 只装在线版（4319），开机自启
#   ./deploy/install.sh tunnel     # 同时装隧道（需要先有 config.yml 和域名）
#   ./deploy/install.sh backup     # 每天 03:30 备份在线版数据到 ~/FolioBackups
#   ./deploy/install.sh uninstall  # 卸载
set -euo pipefail

DIR=$(cd "$(dirname "$0")/.." && pwd)
HOME_DIR=$HOME
AGENTS="$HOME_DIR/Library/LaunchAgents"
MODE=${1:-cloud}

install_one() {
  local name=$1 src="$DIR/deploy/launchd/$1.plist" dst="$AGENTS/$1.plist"
  mkdir -p "$AGENTS" "$HOME_DIR/Library/Logs"
  sed -e "s|__FOLIO_DIR__|$DIR|g" -e "s|__HOME__|$HOME_DIR|g" \
      -e "s|__NODE_BIN__|$(dirname "$(command -v node)")|g" "$src" >"$dst"
  launchctl bootout "gui/$(id -u)/$name" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$dst"
  launchctl kickstart -k "gui/$(id -u)/$name" 2>/dev/null || true
  echo "已安装并启动：$name → $dst"
}

case "$MODE" in
  cloud)
    [ -f "$DIR/.env.cloud" ] || { echo "缺少 .env.cloud，先运行 npm run cloud:setup"; exit 1; }
    install_one com.folio.cloud
    echo "在线版：http://127.0.0.1:4319 （日志 ~/Library/Logs/folio-cloud.log）"
    ;;
  tunnel)
    [ -f "$DIR/deploy/cloudflared/config.yml" ] || { echo "缺少 deploy/cloudflared/config.yml，先按 deploy/README.md 生成"; exit 1; }
    [ -x "$HOME_DIR/.local/bin/cloudflared" ] || { echo "缺少 cloudflared，见 deploy/README.md"; exit 1; }
    install_one com.folio.cloud
    install_one com.folio.tunnel
    echo "隧道已启动（日志 ~/Library/Logs/folio-tunnel.log）"
    ;;
  backup)
    [ -d "$DIR/artifacts/cloud-data" ] || { echo "还没有 artifacts/cloud-data，先启用在线版再备份"; exit 1; }
    install_one com.folio.backup
    echo "备份：每天 03:30 → ~/FolioBackups（日志 ~/Library/Logs/folio-backup.log）"
    "$DIR/deploy/backup.sh"
    ;;
  uninstall)
    for name in com.folio.backup com.folio.tunnel com.folio.cloud; do
      launchctl bootout "gui/$(id -u)/$name" 2>/dev/null || true
      rm -f "$AGENTS/$name.plist"
      echo "已卸载：$name"
    done
    ;;
  *)
    echo "用法：$0 [cloud|tunnel|backup|uninstall]"; exit 1;;
esac
