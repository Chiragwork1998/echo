#!/usr/bin/env bash
# Waits for a notification from the app to be posted (the daily reminder firing with the app closed),
# then prints what the system shows for it, so the text can be checked for what it must not hold.
#
#   .maestro/release/wait-notification.sh [package] [max_seconds]
set -u
PKG="${1:-com.thesaturnlabs.echo}"
LIMIT="${2:-600}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
START=$(date +%s)
echo "process before: [$("$ADB" shell pidof "$PKG" | tr -d '\r')]"
while [ $(( $(date +%s) - START )) -lt "$LIMIT" ]; do
  if "$ADB" shell dumpsys notification --noredact | grep -q "pkg=$PKG"; then
    echo "fired after $(( $(date +%s) - START )) s, at $("$ADB" shell date +%H:%M:%S | tr -d '\r')"
    "$ADB" shell dumpsys notification --noredact | grep -A18 "pkg=$PKG" | grep -E "pkg=|android.title|android.text|channel|tickerText" | head -8
    echo "process after: [$("$ADB" shell pidof "$PKG" | tr -d '\r')]"
    exit 0
  fi
  sleep 10
done
echo "no notification from $PKG within ${LIMIT}s"
exit 1
