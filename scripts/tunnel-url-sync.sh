#!/bin/zsh
# 隧道网址自动同步：监视 cloudflared quick tunnel 日志，
# 一旦出现新的 trycloudflare.com 网址，就写到 ~/.local/folio/current-url 并重启在线版。
# 在线版启动时优先读取该文件作为 FOLIO_PUBLIC_URL（见 scripts/cloud-server.mjs）。
# 该脚本只读写 ~/.local 与 ~/Library/Logs，避开 launchd 对 ~/Documents 的 TCC 限制。
set -u

STATE_DIR="/Users/cc/.local/folio"
URL_FILE="$STATE_DIR/current-url"
TUNNEL_LOG="/Users/cc/Library/Logs/folio-quicktunnel.err.log"
LABEL="gui/$(id -u)/com.folio.cloud"

/bin/mkdir -p "$STATE_DIR"

log(){ print -r -- "[tunnel-sync $(date '+%H:%M:%S')] $*"; }

current_url(){
  /usr/bin/grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "$TUNNEL_LOG" 2>/dev/null | /usr/bin/tail -1
}

apply_url(){
  local url="$1"
  [[ "$url" == "$(/bin/cat "$URL_FILE" 2>/dev/null)" ]] && return 0
  print -r -- "$url" > "$URL_FILE"
  /bin/launchctl kickstart -k "$LABEL" 2>/dev/null
  log "已记录新网址并重启在线版: $url"
}

log "启动，监视 $TUNNEL_LOG"
last=""

# 启动时先对齐一次（处理开机后隧道已先起的情况）
sleep 3
first="$(current_url)"
if [[ -n "$first" ]]; then
  apply_url "$first"; last="$first"
fi

# 持续监视日志追加（-F 跟随文件重建）
/usr/bin/tail -n 0 -F "$TUNNEL_LOG" 2>/dev/null | while read -r line; do
  case "$line" in
    *trycloudflare.com*)
      url="$(current_url)"
      [[ -z "$url" || "$url" == "$last" ]] && continue
      sleep 4   # 等隧道真正就绪再切换
      apply_url "$url"; last="$url"
      ;;
  esac
done
