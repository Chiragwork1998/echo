#!/usr/bin/env bash
# Prints the visible text of the screen, or HANG. A safe `uiautomator dump`: stale dumps are killed
# first and after, because a dump that never returns leaves a process that blocks the next one.
#
#   .maestro/ui.sh [timeout_seconds]
#
# On this emulator the dump never returns on Home or the daily session while the Night loop video
# plays. It takes about 2 seconds with Reduce Motion on, or on any other screen.
set -u
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
LIMIT="${1:-25}"
OUT="$(mktemp -t echo-ui)"

"$ADB" shell pkill -9 -f uiautomator >/dev/null 2>&1
perl -e "alarm $LIMIT; exec @ARGV" "$ADB" exec-out uiautomator dump /dev/tty >"$OUT" 2>/dev/null
"$ADB" shell pkill -9 -f uiautomator >/dev/null 2>&1

if [ "$(wc -c <"$OUT" | tr -d ' ')" -lt 200 ]; then
  echo "HANG after ${LIMIT}s"
  rm -f "$OUT"
  exit 1
fi
grep -o '<node [^>]*>' "$OUT" |
  sed -E 's/.*text="([^"]*)".*content-desc="([^"]*)".*bounds="([^"]*)".*/T:[\1] D:[\2] \3/' |
  grep -vE '^T:\[\] D:\[\]'
rm -f "$OUT"
