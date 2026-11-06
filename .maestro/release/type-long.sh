#!/usr/bin/env bash
# Types a long synthetic entry into the open page in small chunks, because `adb input text` drops
# characters when it is given a long run on a loaded emulator. Needs the page open in Write.
#
#   .maestro/release/type-long.sh [chunks]
set -u
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
CHUNKS="${1:-18}"
"$ADB" shell input tap 540 1300   # the page, below the text: the caret goes to the end
sleep 3
i=0
while [ "$i" -lt "$CHUNKS" ]; do
  "$ADB" shell input text "Lamp%slight%sfell%sacross%sthe%swall%s$i."
  sleep 1.5
  i=$((i + 1))
done
echo "typed $CHUNKS chunks"
