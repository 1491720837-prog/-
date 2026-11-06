#!/bin/zsh
# 把备份包里的三个 .folio.json 导入在线版（保留原 projectId，便于接回飞书同步映射）。
# 用法: zsh scripts/import-backup-projects.sh <解压目录>
set -u
SRC="${1:-/tmp/folio-backup/extracted}"
BASE="http://127.0.0.1:4319"
ORIGIN="http://127.0.0.1:4319"

for f in "$SRC"/browser-projects/*.folio.json; do
  [ -f "$f" ] || continue
  id=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['projectId'])" "$f")
  title=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('title','?'))" "$f")
  python3 - "$f" > /tmp/import-payload.json <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
p.pop('config',None); p.pop('_cloudRevision',None)
print(json.dumps({"project":p,"revision":None}))
PY
  code=$(curl -s -o /tmp/import-resp.json -w "%{http_code}" -X PUT "$BASE/api/cloud/projects/$id" \
    -H "Content-Type: application/json" -H "Origin: $ORIGIN" --data @/tmp/import-payload.json)
  echo "[$code] $title  ($id)  $(head -c 120 /tmp/import-resp.json)"
done
