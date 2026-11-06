#!/usr/bin/env bash
# The journeys that share one install, in the order their state needs. Each flow's header says what it
# expects. Prints PASS or FAIL per flow and carries on, so one failure does not hide the rest.
#
#   ECHO_E2E=1 npx expo start --clear --port 8081     # in another terminal
#   .maestro/all.sh
#
# Server checks (flows 04 and 05 say which): the voice server logs only routes and sizes, never
# content. Run `.maestro/server-log.sh 10m` to see which /api routes a run called.
#
# STATUS (see the final report for what was actually observed): 01 is green from a fresh install; the
# rest of the voice flows were written against the real screens and pass step by step by hand, but
# 02 to 08b have not all had a clean unattended run on this host, whose Maestro reads of Home and the
# session take minutes when it is loaded. The failure/ scripts use adb taps and screenshots instead.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
RESULT="${E2E_OUT:-/tmp/echo-e2e}/summary.txt"
mkdir -p "$(dirname "$RESULT")"
: >"$RESULT"

run() {
  local launch="$1" flow="$2"
  if E2E_LAUNCH="$launch" "$HERE/run.sh" "$flow" >"${E2E_OUT:-/tmp/echo-e2e}/$flow.log" 2>&1; then
    echo "PASS $flow" | tee -a "$RESULT"
  else
    echo "FAIL $flow" | tee -a "$RESULT"
  fi
}

run fresh 01-fresh-start.yaml
run kill 05-voice-consent-keep-only.yaml
run kill 04-live-consent.yaml
run kill 02-daily-voice-hidden.yaml
run kill 03-second-take-appends.yaml
run kill 06-exact-and-tidy.yaml
run kill 08-write-path.yaml
"${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb" shell am force-stop host.exp.exponent
run kill 08b-write-autosave.yaml
cat "$RESULT"
