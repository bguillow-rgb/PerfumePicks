#!/bin/bash
# Robust maestro runner: per-attempt watchdog timeout + wedge cleanup + retry.
# macOS has no `timeout`, so we background maestro and kill it after ATIMEOUT.
# The Expo dev client + clearState reinstall intermittently crashes the first
# viewHierarchy read with kAXErrorInvalidUIElement and then hangs. We bound each
# attempt, kill wedged XCTest/maestro/xcodebuild between attempts, and retry.
# Transient (driver/accessibility) failures retry; a genuine assertion failure
# (logic regression) is reported and stops.
#
# Usage: bash e2e/run.sh <flow.yaml> [maxAttempts] [attemptTimeoutSecs]
set -u
FLOW="$1"
MAX="${2:-6}"
ATIMEOUT="${3:-280}"
TMP="/tmp/maestro_attempt.out"

cleanup() {
  pkill -9 -f "maestro test" 2>/dev/null
  pkill -9 -f "maestro.cli.AppKt" 2>/dev/null
  pkill -9 -f XCTRunner 2>/dev/null
  pkill -9 -f "maestro-driver-iosUITests" 2>/dev/null
  pkill -9 -f xcodebuild 2>/dev/null
  sleep 3
}

attempt=0
while [ $attempt -lt "$MAX" ]; do
  attempt=$((attempt+1))
  : > "$TMP"
  env MAESTRO_DRIVER_STARTUP_TIMEOUT=120000 maestro test "$FLOW" > "$TMP" 2>&1 &
  mpid=$!
  # Watchdog: poll until process exits or ATIMEOUT elapses.
  elapsed=0; timedout=0
  while kill -0 "$mpid" 2>/dev/null; do
    sleep 5; elapsed=$((elapsed+5))
    if [ $elapsed -ge "$ATIMEOUT" ]; then timedout=1; kill -9 "$mpid" 2>/dev/null; break; fi
  done
  wait "$mpid" 2>/dev/null; code=$?
  [ $timedout -eq 1 ] && code=124
  out=$(cat "$TMP")

  # maestro exits 0 ONLY when the flow passes (optional-assert warnings do not
  # fail the run). Trust the exit code; never parse warning text for pass/fail.
  if [ $code -eq 0 ]; then
    echo "PASS $FLOW (attempt $attempt)"; exit 0
  fi

  logdir=$(ls -td /Users/bobguillow/.maestro/tests/*/ 2>/dev/null | head -1)
  # A genuine command failure prints a line ending in "FAILED" (not the optional
  # "Warning: Assertion is false" line) or an "Element not found" error.
  realfail=0
  echo "$out" | grep -qE "\.\.\. FAILED|Element .* not found|Element not found" && realfail=1
  # A watchdog kill (124) is always transient, never a logic failure.
  [ $code -eq 124 ] && realfail=0
  if [ $realfail -eq 1 ]; then
    echo "===== REAL FAILURE: $FLOW (attempt $attempt) ====="
    echo "$out" | grep -vE "WARNING|picocli|jansi|Mutating|Restricted|native-access|final-field" | sed -n '/Running on/,$p' | tail -60
    echo "DEBUG: $logdir"
    exit 1
  fi
  echo "[transient on $FLOW (attempt $attempt, code $code), cleanup+retry]"
  cleanup
done
echo "FAIL(exhausted $MAX) $FLOW"
echo "$out" | grep -vE "WARNING|picocli|jansi|Mutating|Restricted|native-access|final-field" | sed -n '/Running on/,$p' | tail -40
exit 1
