#!/usr/bin/env bash
# Runs one of the Maestro flows against the installed release build (com.thesaturnlabs.echo) instead of
# Expo Go, by copying the flow and its subflows with the app id swapped.
#
#   .maestro/release/run-release.sh 01-fresh-start.yaml
#
# The release build has no Expo Go tip to dismiss and no Metro, so the flow must not call open-app.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
FLOW="$1"
shift
TMP="${E2E_OUT:-/tmp/echo-e2e}/release-flows"
rm -rf "$TMP"
mkdir -p "$TMP"
cp -R "$HERE/subflows" "$TMP/subflows"
for f in "$HERE/$FLOW" "$TMP"/subflows/*.yaml; do
  sed -i '' 's/appId: host.exp.exponent/appId: com.thesaturnlabs.echo/' "$f" 2>/dev/null || true
done
cp "$HERE/$FLOW" "$TMP/$FLOW"
sed -i '' 's/appId: host.exp.exponent/appId: com.thesaturnlabs.echo/' "$TMP/$FLOW"
sed -i '' 's/host.exp.exponent/com.thesaturnlabs.echo/g' "$TMP/$FLOW"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
export JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$(dirname "$ADB"):$PATH"
"$ADB" shell pkill -9 -f uiautomator >/dev/null 2>&1 || true
OUT="${E2E_OUT:-/tmp/echo-e2e}/release/$(basename "$FLOW" .yaml)"
rm -rf "$OUT"
mkdir -p "$OUT"
cd "$OUT"
maestro --device "$("$ADB" get-serialno)" test "$@" --debug-output "$OUT/debug" "$TMP/$FLOW"
