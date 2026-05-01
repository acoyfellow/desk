#!/usr/bin/env bash
# exp-02 run.sh — presence-bound JWT against the local desk-fab-local Worker.
#
# Prereq: cd ~/cloudflare/desk/experiments/_fab-local && bunx wrangler dev
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:8911}"
JQ() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1', ''))"; }

echo "## exp-02 measurements" > "$(dirname "$0")/RESULT.md.tmp"
exec >> "$(dirname "$0")/RESULT.md.tmp"

echo
echo "### 1. Mint a token"
MINT=$(curl -sS -X POST $BASE/auth/issue -H 'content-type: application/json' -d '{"deviceId":"stick-01"}')
echo "\`\`\`json"; echo "$MINT" | python3 -m json.tool; echo "\`\`\`"
TOKEN=$(echo "$MINT" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
JTI=$(echo "$MINT" | python3 -c "import json,sys; print(json.load(sys.stdin)['jti'])")

echo
echo "### 2. Immediately check — should be ok"
R=$(curl -sS "$BASE/auth/check?token=$TOKEN")
echo "\`\`\`json"; echo "$R" | python3 -m json.tool; echo "\`\`\`"

echo
echo "### 3. Heartbeat, then check — should still be ok"
curl -sS -X POST $BASE/auth/heartbeat -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" > /dev/null
R=$(curl -sS "$BASE/auth/check?token=$TOKEN")
echo "\`\`\`json"; echo "$R" | python3 -m json.tool; echo "\`\`\`"

echo
echo "### 4. Tamper test — flip a middle byte in the signature (F-2 fix)"
# Use Python: split at the dots, flip one base64url char in the SIGNATURE part
# (3rd component) at the midpoint, ensuring we mutate something meaningful.
TAMPERED=$(python3 -c "
t = '$TOKEN'
h, p, s = t.split('.')
# Flip char at midpoint of signature; pick a different char from the same alphabet
alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
i = len(s) // 2
orig = s[i]
new = 'A' if orig != 'A' else 'B'
s2 = s[:i] + new + s[i+1:]
print(h + '.' + p + '.' + s2)
")
R=$(curl -sS -o - -w "HTTP_%{http_code}" "$BASE/auth/check?token=$TAMPERED")
echo "\`\`\`"; echo "$R"; echo "\`\`\`"

echo
echo "### 5. Replay test — attacker uses real token AFTER we 'unplug' (no more heartbeats)"
echo "Waiting 65s for presence window (60s) to expire..."
START=$(date +%s)
sleep 65
ELAPSED=$(($(date +%s) - START))
R=$(curl -sS -o - -w "HTTP_%{http_code}" "$BASE/auth/check?token=$TOKEN")
echo "After ${ELAPSED}s without heartbeat:"
echo "\`\`\`"; echo "$R"; echo "\`\`\`"

echo
echo "### 6. Resurrection test — attacker tries to revive expired token via heartbeat (F-1 fix verification)"
HB_RESPONSE=$(curl -sS -o - -w "HTTP_%{http_code}" -X POST $BASE/auth/heartbeat -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}")
echo "Heartbeat against expired token returns:"
echo "\`\`\`"; echo "$HB_RESPONSE"; echo "\`\`\`"
echo
echo "Verify token is still rejected on /check after the failed heartbeat:"
R=$(curl -sS -o - -w "HTTP_%{http_code}" "$BASE/auth/check?token=$TOKEN")
echo "\`\`\`"; echo "$R"; echo "\`\`\`"

echo
echo "### 7. Explicit revoke"
NEW=$(curl -sS -X POST $BASE/auth/issue -H 'content-type: application/json' -d '{"deviceId":"stick-02"}')
NTOKEN=$(echo "$NEW" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
NJTI=$(echo "$NEW" | python3 -c "import json,sys; print(json.load(sys.stdin)['jti'])")
T0=$(python3 -c "import time; print(int(time.time()*1000))")
curl -sS -X POST $BASE/auth/revoke -H 'content-type: application/json' -d "{\"jti\":\"$NJTI\"}" > /dev/null
R=$(curl -sS -o - -w "HTTP_%{http_code}" "$BASE/auth/check?token=$NTOKEN")
T1=$(python3 -c "import time; print(int(time.time()*1000))")
echo "Revocation→reject latency: $((T1-T0))ms"
echo "\`\`\`"; echo "$R"; echo "\`\`\`"
