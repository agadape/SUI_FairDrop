#!/usr/bin/env bash
# Deploy FairDrop contracts to testnet and create a demo auction.
# Run from repo root: bash scripts/deploy.sh
set -e

CONTRACTS_PATH="./contracts"
FRONTEND_ENV="./frontend/.env.local"

# ── 1. Publish package ──────────────────────────────────────────────────────
echo "Publishing contracts to testnet..."
PUBLISH_OUTPUT=$(sui client publish \
  --path "$CONTRACTS_PATH" \
  --gas-budget 200000000 \
  --json 2>&1)

PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for obj in data.get('objectChanges', []):
    if obj.get('type') == 'published':
        print(obj['packageId'])
        break
")

if [ -z "$PACKAGE_ID" ]; then
  echo "ERROR: Could not extract package ID from publish output"
  echo "$PUBLISH_OUTPUT"
  exit 1
fi

echo "Package ID: $PACKAGE_ID"

# ── 2. Create demo auction ──────────────────────────────────────────────────
# commit_end_ms = now + 10 minutes (for demo: short window)
# reveal_end_ms = now + 20 minutes
NOW_MS=$(python3 -c "import time; print(int(time.time() * 1000))")
COMMIT_END_MS=$((NOW_MS + 600000))   # +10 min
REVEAL_END_MS=$((NOW_MS + 1200000))  # +20 min
SUPPLY=5
MIN_BID=100000000  # 0.1 SUI in MIST

echo "Creating demo auction: supply=$SUPPLY, min_bid=0.1 SUI"
echo "  Commit ends: $(date -d @$((COMMIT_END_MS/1000)))"
echo "  Reveal ends: $(date -d @$((REVEAL_END_MS/1000)))"

CREATE_OUTPUT=$(sui client call \
  --package "$PACKAGE_ID" \
  --module auction \
  --function create_auction \
  --args "$SUPPLY" "$MIN_BID" "$COMMIT_END_MS" "$REVEAL_END_MS" \
  --gas-budget 20000000 \
  --json 2>&1)

AUCTION_ID=$(echo "$CREATE_OUTPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for obj in data.get('objectChanges', []):
    if obj.get('type') == 'created' and 'Auction' in obj.get('objectType', ''):
        print(obj['objectId'])
        break
")

if [ -z "$AUCTION_ID" ]; then
  echo "ERROR: Could not extract auction ID"
  echo "$CREATE_OUTPUT"
  exit 1
fi

echo "Auction ID: $AUCTION_ID"

# ── 3. Write .env.local ─────────────────────────────────────────────────────
cat > "$FRONTEND_ENV" <<EOF
NEXT_PUBLIC_PACKAGE_ID=$PACKAGE_ID
NEXT_PUBLIC_AUCTION_ID=$AUCTION_ID
# Add your Enoki API key and Google OAuth client ID:
# NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_...
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
EOF

echo ""
echo "Done! .env.local written:"
cat "$FRONTEND_ENV"
echo ""
echo "Run: cd frontend && npm run dev"
