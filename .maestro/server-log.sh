#!/usr/bin/env bash
# Which voice-server routes were called recently. The server logs the route and byte counts only.
#
#   .maestro/server-log.sh 5m
cd "$(dirname "$0")/../voice-api" || exit 1
vercel --scope chiragtalwar-finzarccoms-projects logs --project echo-voice --no-branch \
  --environment production --since "${1:-5m}" --limit 20 --no-follow 2>&1 | cut -c1-120
