#!/usr/bin/env bash
# Airplane mode for the failure tests, and proof that it took: `airplane.sh on|off`.
# The emulator reaches the Mac's network through its radio, so on cuts ECHO off from the voice server
# while adb (and Metro through adb reverse) carries on.
set -u
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
case "${1:-}" in
  on) "$ADB" shell cmd connectivity airplane-mode enable ;;
  off) "$ADB" shell cmd connectivity airplane-mode disable ;;
  *) echo "usage: airplane.sh on|off" >&2; exit 2 ;;
esac
sleep 6
echo "airplane_mode_on=$("$ADB" shell settings get global airplane_mode_on)"
if "$ADB" shell ping -c 1 -W 3 8.8.8.8 >/dev/null 2>&1; then echo "network: reachable"; else echo "network: unreachable"; fi
