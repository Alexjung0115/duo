#!/usr/bin/env bash
# Usage: run-target.sh <original|pr148|pr149> <checkout>. Prints AUDIT_RESULT lines; never gates on a step.
set -uo pipefail
target=$1 wt=$2
SRC="$(cd "$(dirname "$0")" && pwd)"
PARENT="$(dirname "$wt")"
OUT="$PARENT/audit-results"
INCR=packages/graph/src/incremental
mkdir -p "$OUT"
vt() { local name=$1; shift; pnpm exec vitest run "$@" --maxWorkers=1 --reporter=verbose --reporter=json --outputFile="$OUT/$name.json"; }
step() {
  local name=$1; shift
  local start=$SECONDS
  echo "::group::$name"
  (cd "$wt" && "$@") 2>&1 | tee "$OUT/$name.log"
  local code=${PIPESTATUS[0]}
  echo "::endgroup::"
  for f in "$PARENT"/pr143-*.json; do [ -e "$f" ] && { echo "AUDIT_JSON $name $(tr -d '\n' <"$f")"; mv "$f" "$OUT/$name-$(basename "$f")"; }; done
  if [ -f "$OUT/$name.json" ]; then
    echo "AUDIT_VITEST $name $(node -e 'const j=require(process.argv[1]);console.log(JSON.stringify({total:j.numTotalTests,passed:j.numPassedTests,failed:j.numFailedTests,pending:j.numPendingTests}))' "$OUT/$name.json")"
  fi
  echo "AUDIT_RESULT target=$target os=$RUNNER_OS step=$name exit=$code seconds=$((SECONDS-start))"
  echo "| $name | $code | $((SECONDS-start))s |" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
}

case "$target" in
  original)
    cp "$SRC/original/audit-protection.test.ts" "$wt/$INCR/"
    cp "$SRC/original/audit-original-crash.mjs" "$SRC/original/audit-concurrency.mjs" "$wt/"
    ;;
  pr148|pr149)
    cp "$SRC/review/audit-protection.test.ts" "$SRC/audit-hardlink.test.ts" "$wt/$INCR/"
    cp "$SRC/review/audit-concurrency.mjs" "$SRC/review/audit-oracle-lock.test.mjs" "$wt/"
    git -C "$wt" apply "$SRC/pr148-oracle-compatibility.patch"
    ;;
esac
[ "$target" = pr149 ] && cp "$SRC/review/review-149-config-window.test.ts" "$wt/$INCR/"

echo "| step | exit | time |" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "|---|---|---|" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
if [ "$target" = original ]; then
  step focused vt focused $INCR/refresh-errors.test.ts $INCR/refresh.e2e.test.ts
  step protection vt protection $INCR/audit-protection.test.ts
  step crash node audit-original-crash.mjs
  step concurrency node audit-concurrency.mjs
else
  extra=(); [ "$target" = pr149 ] && extra=($INCR/review-149-config-window.test.ts)
  # macOS ships bash 3.2, where an empty array expansion fails under set -u.
  step focused vt focused $INCR/refresh-errors.test.ts $INCR/refresh.e2e.test.ts tests/cli/index-lock.e2e.test.ts ${extra[@]+"${extra[@]}"}
  step protection vt protection $INCR/audit-protection.test.ts
  step hardlink vt hardlink $INCR/audit-hardlink.test.ts
  step oracle-selftest node --test audit-oracle-lock.test.mjs
  step concurrency node audit-concurrency.mjs
fi
