# Stage a NEW Umbra demo pool on the ALREADY-PUBLISHED package — no republish.
# Republishing would rotate the package id (and Display/Publisher) and break the
# deployed frontend, so for re-staging (esp. short live-demo windows) use this.
#
#   powershell -File umbra\stage_pool.ps1 -CommitWindowMinutes 2 -RevealWindowMinutes 3
#
# Defaults to the package + UMB TreasuryCap published 2026-06-14.

param(
    [string]$PackageId   = "0xd3196fdf9cc6696ac7f5fcfa80252227b2504721860a7cf414150a6541b9ece0",
    [string]$TreasuryCap = "0xbe4c53350b28f4982c05ecd37a11df16013bd26c2b63cd7188b2eaf8d0db4bb0",
    [int]$CommitWindowMinutes = 2,
    [int]$RevealWindowMinutes = 3,     # absolute from now; must be > CommitWindowMinutes
    [long]$SupplyUnits = 100,
    [long]$MinPriceMist = 1000000,     # 0.001 SUI per UMB unit
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
    --args $umbCoin $SupplyUnits $MinPriceMist $commitEndMs $revealEndMs `
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
