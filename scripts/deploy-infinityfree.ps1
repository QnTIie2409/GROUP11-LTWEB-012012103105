<#
.SYNOPSIS
    Packages web-deployable files into dist-infinityfree/ and optionally deploys them to InfinityFree via FTP.
#>
[CmdletBinding()]
param(
    [switch]$PackageOnly,
    [switch]$Zip,
    [string]$FtpServer = $env:FTP_SERVER,
    [string]$FtpUser = $env:FTP_USERNAME,
    [string]$FtpPass = $env:FTP_PASSWORD,
    [string]$RemoteDir = "/lingostudio.ifree.page/htdocs"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $RepoRoot "dist-infinityfree"
$ZipPath = Join-Path $RepoRoot "dist-infinityfree.zip"

function Copy-RelativeFile {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [switch]$Optional
    )

    $source = Join-Path $RepoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        if ($Optional) {
            return
        }
        throw "Required file not found: $source"
    }

    $dest = Join-Path $DistDir $RelativePath
    $destParent = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $destParent)) {
        New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $dest -Force
}

function Copy-RelativeDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [string[]]$ExcludeNames = @(),
        [string[]]$ExcludeExtensions = @('.psd')
    )

    $source = Join-Path $RepoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Required directory not found: $source"
    }

    $items = Get-ChildItem -LiteralPath $source -Recurse -Force
    $rootFull = (Get-Item -LiteralPath $source -Force).FullName.TrimEnd('\', '/')

    $destRoot = Join-Path $DistDir $RelativePath
    if (-not (Test-Path -LiteralPath $destRoot)) {
        New-Item -ItemType Directory -Path $destRoot -Force | Out-Null
    }

    foreach ($item in $items) {
        if ($ExcludeNames -contains $item.Name) {
            continue
        }
        if (-not $item.PSIsContainer -and ($ExcludeExtensions -contains $item.Extension.ToLowerInvariant())) {
            continue
        }

        $relSub = $item.FullName.Substring($rootFull.Length).TrimStart('\', '/')
        $targetPath = Join-Path $destRoot $relSub

        if ($item.PSIsContainer) {
            if (-not (Test-Path -LiteralPath $targetPath)) {
                New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
            }
        }
        else {
            $parentDir = Split-Path -Parent $targetPath
            if (-not (Test-Path -LiteralPath $parentDir)) {
                New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
            }
            Copy-Item -LiteralPath $item.FullName -Destination $targetPath -Force
        }
    }
}

function ConvertTo-EncodedFtpRelativePath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $segments = $RelativePath -split '[\\/]' | Where-Object { $_ -ne '' }
    $encodedSegments = foreach ($segment in $segments) {
        ([System.Uri]::EscapeDataString($segment)) -replace "'", "%27"
    }
    return ($encodedSegments -join '/')
}

# 1. Build a clean dist-infinityfree/ directory
if (Test-Path -LiteralPath $DistDir) {
    Remove-Item -LiteralPath $DistDir -Recurse -Force
}
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

# Root static & config files
Copy-RelativeFile ".htaccess" -Optional
Copy-RelativeFile "index.html"
Copy-RelativeFile "group.html"
Copy-RelativeFile "image copy.png" -Optional
Copy-RelativeDirectory "css"

# Five member portfolio folders (use [char] escapes so PS 5.1 handles UTF-8 regardless of codepage)
$memberDirs = @(
    "LeHuy",
    "hieu'",
    ("Ng{0} Kh{1}nh Nguy{2}n" -f [char]0x00F4, [char]0x00E1, [char]0x00EA),
    ("Th{0}n_{1}{2}c_Ti{3}n_075207010355" -f [char]0x00E2, [char]0x0110, [char]0x1EE9, [char]0x1EBF),
    "portfolio_2_0_quay"
)
foreach ($memberDir in $memberDirs) {
    Copy-RelativeDirectory $memberDir
}

# Web-deployable files inside translate-web/ (exclude Node scripts, DB dumps, node_modules, config.local.php, README.md)
Copy-RelativeFile "translate-web/index.html"
Copy-RelativeDirectory "translate-web/css"
Copy-RelativeDirectory "translate-web/js"
Copy-RelativeDirectory "translate-web/api" -ExcludeNames @("config.local.php", "README.md")

Write-Host "Packaged web files into: $DistDir" -ForegroundColor Green

# 2. Optional ZIP archive
if ($Zip) {
    if (Test-Path -LiteralPath $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }
    $zipSource = Join-Path $DistDir "*"
    Compress-Archive -Path $zipSource -DestinationPath $ZipPath -CompressionLevel Optimal -Force
    Write-Host "Created archive: $ZipPath" -ForegroundColor Green
}

if ($PackageOnly) {
    Write-Host "PackageOnly specified; skipping FTP upload."
    exit 0
}

# 3. Validate FTP credentials and upload via curl.exe
if ([string]::IsNullOrWhiteSpace($FtpServer) -or [string]::IsNullOrWhiteSpace($FtpUser) -or [string]::IsNullOrWhiteSpace($FtpPass)) {
    Write-Error @"
Missing FTP credentials. Provide -FtpServer, -FtpUser, -FtpPass or set environment variables FTP_SERVER, FTP_USERNAME, FTP_PASSWORD.
Examples:
  `$env:FTP_SERVER='ftpupload.net'; `$env:FTP_USERNAME='if0_XXXXXXXX'; `$env:FTP_PASSWORD='your-password'
  .\scripts\deploy-infinityfree.ps1
Or build a ZIP package without uploading:
  .\scripts\deploy-infinityfree.ps1 -PackageOnly -Zip
"@
    exit 1
}

$curlCmd = Get-Command "curl.exe" -ErrorAction SilentlyContinue
if (-not $curlCmd) {
    throw "curl.exe was not found on PATH."
}

$normalizedRemote = "/" + $RemoteDir.Trim('/')
if ($normalizedRemote -eq "/") {
    $normalizedRemote = ""
}
$cleanServer = ($FtpServer -replace '^ftp://', '').TrimEnd('/')

$distFull = (Get-Item -LiteralPath $DistDir -Force).FullName.TrimEnd('\', '/')
$filesToUpload = Get-ChildItem -LiteralPath $DistDir -Recurse -File -Force
$total = $filesToUpload.Count
$index = 0

foreach ($file in $filesToUpload) {
    $index++
    $relPath = $file.FullName.Substring($distFull.Length).TrimStart('\', '/')
    $encodedPath = ConvertTo-EncodedFtpRelativePath -RelativePath $relPath
    $remoteUrl = "ftp://$cleanServer$normalizedRemote/$encodedPath"

    Write-Host "[$index/$total] Uploading $relPath -> $remoteUrl"
    & curl.exe --ftp-create-dirs --silent --show-error --fail -T $file.FullName --user "${FtpUser}:${FtpPass}" $remoteUrl
    if ($LASTEXITCODE -ne 0) {
        throw "FTP upload failed for '$relPath' (curl exit code $LASTEXITCODE)."
    }
}

Write-Host "Successfully uploaded $total file(s) to ftp://$cleanServer$normalizedRemote/" -ForegroundColor Green
