# Plant a low floor order on an Umbra pool so a higher demo order clears above it
# and the MEV-Shield NFT shows a juicy number. Wraps the Node planter (which does
# sha3-256 + the Option arg + signs from a dedicated dummy keypair — things
# `sui client call` can't do cleanly).
#
#   powershell -File umbra/submit_floor.ps1 -PoolId 0x... [-PriceSui 0.001] [-Qty 5]
#
# Blocks through the pool's commit window, then reveals. Run it once, pre-pitch.

param(
    [Parameter(Mandatory = $true)][string]$PoolId,
    [double]$PriceSui = 0.001,
    [long]$Qty = 5
)

$ErrorActionPreference = "Stop"
Push-Location "$PSScriptRoot/../frontend"
try {
    node scripts/umbra_floor.mjs $PoolId $PriceSui $Qty
} finally {
    Pop-Location
}
