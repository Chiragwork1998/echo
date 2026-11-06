#!/usr/bin/env bash
# A hidden take sent to a voice server that cannot answer: what does the person read?
#
#   .maestro/failures/server-failure.sh <name>
#
# Run Metro first with the address or token wrong, for ONE run:
#   dead host:    EXPO_PUBLIC_VOICE_URL=https://echo-voice-dead.invalid ECHO_E2E=1 npx expo start --clear --port 8081
#   wrong token:  EXPO_PUBLIC_VOICE_TOKEN=not-the-token ECHO_E2E=1 npx expo start --clear --port 8081
# (a variable on the command line wins over .env.local, which is never read or printed). Then
# `.maestro/launch.sh kill`, and this. Voice must already be allowed. The message must be honest, must
# not say "no connection" (the phone has one), and the recording must be kept.
set -u
NAME="${1:-server-failure}"
SHOTS="/tmp/echo-e2e/$NAME"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }

"$ADB" shell settings put global transition_animation_scale 0
tap 540 1000   # Begin
sleep 50
tap 540 2210   # Hide words, if they are shown: a hidden take opens no stream
sleep 4
shot 0-ready
tap 540 900    # the open sky starts the take
sleep 12
tap 535 2096   # Stop
sleep 40
shot 1-after-stop
