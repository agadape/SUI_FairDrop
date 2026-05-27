# Deploy FairDrop contracts to testnet and create a demo auction.
# Run from repo root: powershell -File scripts\deploy.ps1
param(
    [int]$CommitWindowMinutes = 10,
    [int]$RevealWindowMinutes = 20,
    [int]$Supply = 5,
    [long]$MinBidMist = 100000000  # 0.1 SUI
)

$ErrorActionPreference = "Stop"
$env:PATH += ";C:\Users\Advan\AppData\Local\bin;C:\Users\Advan\AppData\Local\suiup\binaries\testnet"

# ── 1. Publish ──────────────────────────────────────────────────────────────
Write-Host "Publishing contracts to testnet..." -ForegroundColor Cyan
$publishJson = sui client publish contracts/ --gas-budget 200000000 --json 2>&1 | Out-String
$publish = $publishJson | ConvertFrom-Json

$packageId = ($publish.objectChanges | Where-Object { $_.type -eq "published" } | Select-Object -First 1).packageId
if (-not $packageId) {
    Write-Error "Could not extract packageId. Output:`n$publishJson"
    exit 1
}
Write-Host "Package ID: $packageId" -ForegroundColor Green

# ── 2. Create auction ───────────────────────────────────────────────────────
$nowMs = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$commitEndMs = $nowMs + ($CommitWindowMinutes * 60 * 1000)
$revealEndMs = $nowMs + ($RevealWindowMinutes * 60 * 1000)

Write-Host "Creating auction: supply=$Supply, min_bid=$([math]::Round($MinBidMist/1e9, 2)) SUI" -ForegroundColor Cyan

$createJson = sui client call `
    --package $packageId `
    --module auction `
    --function create_auction `
    --args $Supply $MinBidMist $commitEndMs $revealEndMs `
    --gas-budget 20000000 `
    --json 2>&1 | Out-String
$create = $createJson | ConvertFrom-Json

$auctionId = ($create.objectChanges | Where-Object {
    $_.type -eq "created" -and $_.objectType -like "*::auction::Auction"
} | Select-Object -First 1).objectId

if (-not $auctionId) {
    Write-Error "Could not extract auction ID. Output:`n$createJson"
    exit 1
}
Write-Host "Auction ID: $auctionId" -ForegroundColor Green

# ── 3. Write .env.local ─────────────────────────────────────────────────────
$envContent = @"
NEXT_PUBLIC_PACKAGE_ID=$packageId
NEXT_PUBLIC_AUCTION_ID=$auctionId
# NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_...
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
"@

$envContent | Out-File -FilePath "frontend\.env.local" -Encoding utf8
Write-Host "`nWrote frontend\.env.local" -ForegroundColor Green
Write-Host $envContent
Write-Host "`nRun: cd frontend; npm run dev" -ForegroundColor Yellow
