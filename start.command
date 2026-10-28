#!/bin/zsh
cd "$(dirname "$0")"
exec node scripts/server.mjs --open
