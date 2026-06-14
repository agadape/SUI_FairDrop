# Stage a NEW Umbra demo pool on the ALREADY-PUBLISHED package — no republish.
# Republishing would rotate the package id (and Display/Publisher) and break the
# deployed frontend, so for re-staging (esp. short live-demo windows) use this.
#
#   powershell -File umbra\stage_pool.ps1 -CommitWindowMinutes 2 -RevealWindowMinutes 3
#
# Defaults to the package + UMB TreasuryCap published 2026-06-14.

param(
    [string]$PackageId   = "0xe515f10377693b0d1b44434783ab7d2e5ed58dd33415bd46b34ed61f4faf5886",
    [string]$TreasuryCap = "0x7fec7346af12c680084b7ac90df11b2a9d907475acb7f97f57f59c76bbfbc018",
    [int]$CommitWindowMinutes = 2,
    [int]$RevealWindowMinutes = 3,     # absolute from now; must be > CommitWindowMinutes
    [long]$SupplyUnits = 100,
    [long]$MinPriceMist = 1000000,     # 0.001 SUI per UMB unit (reveal floor)
    [long]$MinBidMist = 1000000,       # 0.001 SUI min escrow per order (anti-spam)
    [long]$InventoryMint = 100
)

$ErrorActionPreference = "Stop"
$env:PATH += ";C:\Users\Advan\AppData\Local\bin;C:\Users\Advan\AppData\Local\suiup\binaries\testnet"

# ── Mint fresh UMB inventory ──────────────────────────────────────────────────
Write-Host "Minting $InventoryMint UMB inventory..." -ForegroundColor Cyan
$mintJson = sui client call --package $PackageId --module umb --function mint `
    --args $TreasuryCap $InventoryMint --gas-budget 20000000 --json | Out-String
$mint = $mintJson | ConvertFrom-Json
$umbCoin = ($mint.objectChanges | Where-Object {
    $_.type -eq "created" -and $_.objectType -like "*coin::Coin<*::umb::UMB>"
} | Select-Object -First 1).objectId
if (-not $umbCoin) { Write-Error "No UMB coin minted. Output:`n$mintJson"; exit 1 }
Write-Host "UMB inventory coin: $umbCoin" -ForegroundColor Green

# ── Create pool with short live-demo windows ──────────────────────────────────
$nowMs = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$commitEndMs = $nowMs + ($CommitWindowMinutes * 60L * 1000)
$revealEndMs = $nowMs + ($RevealWindowMinutes * 60L * 1000)
Write-Host "Pool windows: COMMIT $CommitWindowMinutes min, REVEAL ends $RevealWindowMinutes min from now" -ForegroundColor Yellow

$poolJson = sui client call --package $PackageId --module umbra_swap --function create_pool `
    --args $umbCoin $SupplyUnits $MinPriceMist $MinBidMist $commitEndMs $revealEndMs `
    --gas-budget 30000000 --json | Out-String
$pool = $poolJson | ConvertFrom-Json
$poolId = ($pool.objectChanges | Where-Object {
    $_.type -eq "created" -and $_.objectType -like "*umbra_swap::SwapPool"
} | Select-Object -First 1).objectId
$makerCap = ($pool.objectChanges | Where-Object {
    $_.type -eq "created" -and $_.objectType -like "*umbra_swap::MakerCap"
} | Select-Object -First 1).objectId
if (-not $poolId) { Write-Error "No SwapPool created. Output:`n$poolJson"; exit 1 }

Write-Host "`n──────── SHORT DEMO POOL STAGED ────────" -ForegroundColor Yellow
Write-Host "PACKAGE_ID : $PackageId  (unchanged)"
Write-Host "NEW POOL_ID: $poolId"
Write-Host "MAKER_CAP  : $makerCap"
Write-Host "COMMIT closes in $CommitWindowMinutes min · REVEAL closes in $RevealWindowMinutes min"
Write-Host "`nUpdate NEXT_PUBLIC_UMBRA_POOL_ID = $poolId"
