# Stages the local LLM the desktop app drafts report text with: llama.cpp's
# llama-server (CPU build) and one GGUF model, pinned by version and SHA-256.
#
# Output goes to desktop-llm/ at the repo root, which package.json's extraResources
# copies to resources/llm/ in the installer; main.js starts llama-server from there.
# Downloads are cached in desktop-llm-cache/ and skipped when the hash already matches,
# so rerunning costs nothing. Both folders are gitignored.
#
# To change the model or llama.cpp build, update the pins below together with their
# hashes. The model must be a chat model llama-server can run with `--reasoning off`.

$ErrorActionPreference = "Stop"
# Invoke-WebRequest's progress bar slows large downloads in Windows PowerShell 5.1.
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$StageDir = Join-Path $RepoRoot "desktop-llm"
$CacheDir = Join-Path $RepoRoot "desktop-llm-cache"

# llama.cpp b11146 is the build behind release v0.5.0 (its nightly-tag.txt).
$LlamaBuild = "b11146"
$LlamaZip = @{
  Url    = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaBuild/llama-$LlamaBuild-bin-win-cpu-x64.zip"
  Sha256 = "14cf1303ca9ac3abd94816850532f9f9a69ac66fbaca3776fc6f9061c2fac1d1"
  Path   = Join-Path $CacheDir "llama-$LlamaBuild-bin-win-cpu-x64.zip"
}
$LlamaLicense = @{
  Url    = "https://raw.githubusercontent.com/ggml-org/llama.cpp/$LlamaBuild/LICENSE"
  Sha256 = "94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d"
  Path   = Join-Path $CacheDir "LICENSE-llama.cpp"
}

# Qwen2.5-1.5B-Instruct, Q4_K_M (Apache-2.0), pinned to a commit of Qwen's own GGUF repo.
# Chosen over Qwen3.5-2B by running the real report prompt through both 10 times: valid
# JSON with both sections filled 10/10 against 2/10, in about half the time (4-13 s per
# report on a laptop CPU).
$ModelRepo = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9"
$Model = @{
  Url    = "$ModelRepo/qwen2.5-1.5b-instruct-q4_k_m.gguf"
  Sha256 = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"
  # Staged directly rather than cached and copied: at 1.1 GB, one copy is plenty.
  Path   = Join-Path $StageDir "model.gguf"
}
$ModelLicense = @{
  Url    = "$ModelRepo/LICENSE"
  Sha256 = "832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e"
  Path   = Join-Path $CacheDir "LICENSE-model"
}

# llama-server and what it loads. The ggml-cpu-* variants are all kept: ggml picks the
# one matching the CPU at runtime, so dropping any breaks some machines.
$ServerFiles = @(
  "llama-server.exe", "llama-server-impl.dll", "llama-common.dll", "llama.dll", "mtmd.dll",
  "ggml.dll", "ggml-base.dll", "ggml-cpu-*.dll", "libomp.dll", "LICENSE-LLVM-OpenMP"
)

function Get-Sha256($Path) {
  (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Get-Pinned($Item) {
  if ((Test-Path $Item.Path) -and ((Get-Sha256 $Item.Path) -eq $Item.Sha256)) {
    Write-Host "  cached: $(Split-Path -Leaf $Item.Path)"
    return
  }
  Write-Host "  downloading: $($Item.Url)"
  $partial = "$($Item.Path).partial"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Item.Path) | Out-Null
  Invoke-WebRequest -Uri $Item.Url -OutFile $partial -UseBasicParsing
  $actual = Get-Sha256 $partial
  if ($actual -ne $Item.Sha256) {
    Remove-Item -Force $partial
    throw "SHA-256 mismatch for $($Item.Url): expected $($Item.Sha256), got $actual"
  }
  Move-Item -Force $partial $Item.Path
}

Write-Host "Staging desktop LLM into $StageDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $StageDir, $CacheDir | Out-Null

Get-Pinned $LlamaZip
$unzipped = Join-Path $CacheDir "llama-$LlamaBuild"
if (-Not (Test-Path (Join-Path $unzipped "llama-server.exe"))) {
  Expand-Archive -Force -Path $LlamaZip.Path -DestinationPath $unzipped
}
# Replace, not merge, so a file dropped from $ServerFiles (or left by an older build)
# does not linger in the installer.
Get-ChildItem -Path $StageDir -File | Where-Object { $_.Name -ne "model.gguf" } | Remove-Item -Force
foreach ($pattern in $ServerFiles) {
  $matched = Get-ChildItem -Path $unzipped -Filter $pattern -File
  if (-Not $matched) { throw "llama.cpp $LlamaBuild has no $pattern" }
  $matched | Copy-Item -Destination $StageDir
}

Get-Pinned $LlamaLicense
Get-Pinned $ModelLicense
Copy-Item -Path $LlamaLicense.Path, $ModelLicense.Path -Destination $StageDir
Get-Pinned $Model

$size = (Get-ChildItem -Path $StageDir -File | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("Desktop LLM staged: {0:N0} MB" -f $size) -ForegroundColor Green
