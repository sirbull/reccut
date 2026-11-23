# Build the optional persistent adapter for Windows x64: CPU only, static
# ggml and a static MSVC runtime, so the user needs no Visual C++ redistributable.
# Usage: powershell -File native/voxcpm/build-windows.ps1 <llama.cpp-omni checkout> <output directory>
param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [Parameter(Mandatory = $true)][string]$OutputDir
)
$ErrorActionPreference = 'Stop'
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" } }

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$catalog = Join-Path $projectDir 'src\main\ttsCatalog.json'
$expectedRevision = node -p "require(process.argv[1]).voxcpm.engine.revision" $catalog; Check 'Reading the catalog'
$expectedProtocol = node -p "require(process.argv[1]).voxcpm.engine.protocol" $catalog; Check 'Reading the catalog'
$SourceDir = (Resolve-Path $SourceDir).Path
$revision = git -C $SourceDir rev-parse HEAD; Check 'Reading the upstream revision'
if ($revision -ne $expectedRevision) { throw "Upstream is $revision, the catalog pins $expectedRevision" }
$dirty = git -C $SourceDir status --porcelain --untracked-files=no; Check 'Reading upstream status'
if ($dirty) { throw 'The upstream checkout has local changes. Lock patches in this repository instead.' }
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw "Windows x64 only, this machine is $env:PROCESSOR_ARCHITECTURE" }

# Use the MSVC x64 developer environment, from vswhere when not already active.
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path $vswhere)) { throw 'MSVC was not found. Install Build Tools with Desktop development with C++.' }
  $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if (-not $vs) { throw 'No Visual Studio installation with the x64 C++ tools was found.' }
  Import-Module (Join-Path $vs 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll')
  Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64' | Out-Null
}
foreach ($tool in 'cl.exe', 'cmake', 'ninja', 'dumpbin.exe', 'mt.exe') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is missing" }
}

New-Item -ItemType Directory -Force $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
$build = Join-Path $OutputDir 'server-build'
# Portable baseline: no GPU backends, OpenMP or optional x86 extensions, so
# MSVC gets no /arch flag (x64 SSE2). Each flag is explicit because
# GGML_NATIVE=OFF alone does not disable them. MSVC has no FMA/F16C options.
cmake -S (Join-Path $projectDir 'native\voxcpm') -B $build -G Ninja "-DVOXCPM_SOURCE_DIR=$SourceDir" `
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded `
  -DBUILD_SHARED_LIBS=OFF -DGGML_BACKEND_DL=OFF -DGGML_NATIVE=OFF `
  -DGGML_METAL=OFF -DGGML_CUDA=OFF -DGGML_VULKAN=OFF -DENABLE_COREML=OFF -DGGML_OPENMP=OFF `
  -DGGML_SSE42=OFF -DGGML_BMI2=OFF -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_AVX512=OFF -DGGML_AVX_VNNI=OFF `
  -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF
Check 'CMake configuration'
cmake --build $build --target reccut-voxcpm --parallel 4; Check 'Engine build'

$asset = 'reccut-voxcpm-win-x64.exe'
$exe = Join-Path $OutputDir $asset
Copy-Item (Join-Path $build 'bin\reccut-voxcpm.exe') $exe -Force

# Only Windows system DLLs, never a Visual C++ runtime or a DLL from the build machine.
$deps = (dumpbin /NOLOGO /DEPENDENTS $exe) | Where-Object { $_ -match '^\s+\S+\.dll\s*$' } | ForEach-Object { $_.Trim() }
Check 'dumpbin'
$deps | Set-Content -Encoding ascii (Join-Path $OutputDir 'dependencies.txt')
foreach ($dll in $deps) {
  if ($dll -match '^(vcruntime|msvcp|ucrtbase|api-ms-win-crt|vcomp|libomp|libgomp)') { throw "Unexpected runtime dependency: $dll" }
  if (-not (Test-Path (Join-Path $env:SystemRoot "System32\$dll"))) { throw "Unexpected non-system dependency: $dll" }
}

# The UTF-8 code page manifest must be embedded, not left beside the EXE.
$manifest = Join-Path $OutputDir 'manifest.xml'
mt.exe -nologo "-inputresource:$exe;#1" "-out:$manifest"; Check 'Reading the embedded manifest'
if (-not (Select-String -Path $manifest -Pattern '<activeCodePage[^>]*>UTF-8</activeCodePage>' -Quiet)) { throw 'The UTF-8 manifest is not embedded' }

& $exe --help > (Join-Path $OutputDir 'smoke.txt') 2>&1
if (-not (Select-String -Path (Join-Path $OutputDir 'smoke.txt') -Pattern 'VoxCPM2 CLI' -Quiet)) { throw 'The help check failed' }
$protocol = & $exe --protocol; Check 'Protocol check'
$protocol | Set-Content -Encoding ascii (Join-Path $OutputDir 'protocol.json')
if ((ConvertFrom-Json ($protocol -join '')).protocol -ne [int]$expectedProtocol) { throw "Protocol is not $expectedProtocol" }

$licenses = 'llama-cpp-omni-MIT.txt', 'nlohmann-json-MIT.txt' | ForEach-Object { [IO.File]::ReadAllBytes((Join-Path $projectDir "assets\licenses\$_")) }
[IO.File]::WriteAllBytes((Join-Path $OutputDir "$asset.LICENSE.txt"), [byte[]]($licenses | ForEach-Object { $_ }))
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $OutputDir "$asset.sha256"), "$hash  $asset`n")
"Built $asset ($hash)"
