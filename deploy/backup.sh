#!/bin/zsh
# 备份在线版的持久化数据。数据是唯一副本：Project 版本、PDF、图片都在这里。
set -euo pipefail
DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC="$DIR/artifacts/cloud-data"
DEST="${FOLIO_BACKUP_DIR:-$HOME/FolioBackups}"
KEEP="${FOLIO_BACKUP_KEEP:-7}"

[ -d "$SRC" ] || { echo "没有找到 $SRC，尚未初始化在线版数据"; exit 1; }
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
TMP="$DEST/.cloud-data-$STAMP.tgz.part"
tar -czf "$TMP" -C "$(dirname "$SRC")" "$(basename "$SRC")"
mv "$TMP" "$DEST/cloud-data-$STAMP.tgz"

# 只保留最近 KEEP 份，避免无限增长
ls -1t "$DEST"/cloud-data-*.tgz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; done

echo "$(date '+%F %T') 备份完成：$DEST/cloud-data-$STAMP.tgz ($(du -h "$DEST/cloud-data-$STAMP.tgz" | cut -f1))"
