# Publish the Umbra package to testnet, mint UMB inventory, and stage a demo pool.
# Run from repo root:  powershell -File umbra\deploy_umbra.ps1
#
# Fresh publish — its OWN package id, Publisher and Display<MevShieldNFT>. Does NOT
# touch the deployed fairdrop auction package.

param(
    [int]$CommitWindowDays = 30,
    [int]$RevealWindowDays = 37,
    [long]$SupplyUnits = 100,          # UMB units the maker lists
    [long]$MinPriceMist = 1000000,     # 0.001 SUI per UMB unit (floor)
    [long]$InventoryMint = 100         # UMB raw units to mint as inventory (>= SupplyUnits)
)

$ErrorActionPreference = "Stop"
$env:PATH += ";C:\Users\Advan\AppData\Local\bin;C:\Users\Advan\AppData\Local\suiup\binaries\testnet"

# ── 1. Publish ────────────────────────────────────────────────────────────────
Write-Host "Publishing Umbra to testnet..." -ForegroundColor Cyan
$publishJson = sui client publish "umbra" --gas-budget 300000000 --json | Out-String
$publish = $publishJson | ConvertFrom-Json

$packageId = ($publish.objectChanges | Where-Object { $_.type -eq "published" } | Select-Object -First 1).packageId
if (-not $packageId) { Write-Error "No packageId. Output:`n$publishJson"; exit 1 }
Write-Host "PACKAGE_ID: $packageId" -ForegroundColor Green

$treasuryCap = ($publish.objectChanges | Where-Object {
    $_.type -eq "created" -and $_.objectType -like "*coin::TreasuryCap<*::umb::UMB>"
} | Select-Object -First 1).objectId
if (-not $treasuryCap) { Write-Error "No TreasuryCap<UMB>. Output:`n$publishJson"; exit 1 }
Write-Host "UMB TreasuryCap: $treasuryCap" -ForegroundColor Green

# ── 2. Mint UMB inventory (to caller) ─────────────────────────────────────────
Write-Host "Minting $InventoryMint UMB inventory..." -ForegroundColor Cyan
$mintJson = sui client call --package $packageId --module umb --function mint `
    --args $treasuryCap $InventoryMint --gas-budget 20000000 --json | Out-String
$mint = $mintJson | ConvertFrom-Json
$umbCoin = ($mint.objectChanges | Where-Object {
    $_.type -eq "created" -and $_.objectType -like "*coin::Coin<*::umb::UMB>"
} | Select-Object -First 1).objectId
if (-not $umbCoin) { Write-Error "No UMB coin minted. Output:`n$mintJson"; exit 1 }
Write-Host "UMB inventory coin: $umbCoin" -ForegroundColor Green

# ── 3. Stage a demo pool (long COMMIT window) ─────────────────────────────────
$nowMs = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$commitEndMs = $nowMs + ($CommitWindowDays * 24L * 60 * 60 * 1000)
$revealEndMs = $nowMs + ($RevealWindowDays * 24L * 60 * 60 * 1000)

Write-Host "Creating pool: supply=$SupplyUnits min_price=$MinPriceMist MIST/unit" -ForegroundColor Cyan
$poolJson = sui client call --package $packageId --module umbra_swap --function create_pool `
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

Write-Host "`n──────── UMBRA DEPLOYED ────────" -ForegroundColor Yellow
Write-Host "PACKAGE_ID : $packageId"
Write-Host "POOL_ID    : $poolId  (shared, COMMIT for $CommitWindowDays days)"
Write-Host "MAKER_CAP  : $makerCap"
Write-Host "UMB_CAP    : $treasuryCap"
Write-Host "`nSet in frontend/.env.local AND the Vercel dashboard:" -ForegroundColor Cyan
Write-Host "NEXT_PUBLIC_UMBRA_PACKAGE_ID=$packageId"
Write-Host "NEXT_PUBLIC_UMBRA_POOL_ID=$poolId"
