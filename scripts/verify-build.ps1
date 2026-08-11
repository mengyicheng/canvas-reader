<#
.SYNOPSIS
  Tauri 桌面应用一键验证：类型检查 + 前端构建 + 桌面二进制构建。
.DESCRIPTION
  1) 探测 node / cargo / C 链接器（MSVC cl 或 MinGW gcc），缺失时给出明确指引；
  2) 依次运行 tsc --noEmit → vite build → tauri build --no-bundle；
  3) 任一步失败立即中止并报告；全部通过则打印产物 .exe 路径。
  用法：
    powershell -ExecutionPolicy Bypass -File scripts/verify-build.ps1
  或直接 npm run verify（已在 package.json 注册）。
#>
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-FAIL($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function Run($name, $cmd) {
  Write-Step $name
  Write-Host "  > $cmd"
  Invoke-Expression $cmd
  $code = $LASTEXITCODE
  if ($code -eq 0) { Write-OK "$name 通过 (exit 0)"; return $true }
  Write-FAIL "$name 失败 (exit $code)"
  return $false
}

# ── 0. 环境探测 ──────────────────────────────────────────────
Write-Step "环境探测"
if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "  Node : $(node -v)" }
else { Write-FAIL "未找到 node，请先安装 Node.js"; exit 2 }
if (Get-Command cargo -ErrorAction SilentlyContinue) { Write-Host "  Cargo: $(cargo --version)" }
else { Write-FAIL "未找到 cargo，请先安装 Rust (https://rustup.rs)"; exit 2 }

# ── 链接器探测 + 必要时用 vswhere 注入 MSVC 环境 ──────────────
$linkerFound = $false
if (Get-Command cl -ErrorAction SilentlyContinue) {
  Write-Host "  MSVC 链接器 cl 已就绪"
  $linkerFound = $true
} elseif (Get-Command gcc -ErrorAction SilentlyContinue) {
  Write-Host "  MinGW 链接器 gcc 已就绪"
  $linkerFound = $true
} else {
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsPath) {
      $msvc = Get-ChildItem "$vsPath\VC\Tools\MSVC" -Directory -ErrorAction SilentlyContinue |
              Sort-Object Name | Select-Object -Last 1
      if ($msvc) {
        $binPath = Join-Path $msvc.FullName "bin\Hostx64\x64"
        if (Test-Path $binPath) {
          $env:PATH = "$binPath;$env:PATH"
          $sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory -ErrorAction SilentlyContinue |
                 Sort-Object Name | Select-Object -Last 1
          if ($sdk) { $env:PATH = "$(Join-Path $sdk.FullName 'x64');$env:PATH" }
          if (Get-Command cl -ErrorAction SilentlyContinue) {
            Write-Host "  已通过 vswhere 注入 MSVC 环境: $binPath"
            $linkerFound = $true
          }
        }
      }
    }
  }
}

if (-not $linkerFound) {
  Write-FAIL "未找到 C 链接器 (cl / gcc)，无法链接桌面二进制。"
  Write-Host "  方式 A：从『x64 Native Tools Command Prompt for VS』或『Developer Command Prompt for VS』重新运行本脚本。" -ForegroundColor Yellow
  Write-Host "  方式 B：安装 MinGW-w64 并把其 bin 目录加入 PATH。" -ForegroundColor Yellow
  exit 2
}

# ── 1. 前端类型检查 ──────────────────────────────────────────
if (-not (Run "前端类型检查 (tsc)" "npx --yes tsc --noEmit")) { exit 1 }

# ── 2. 前端构建 ─────────────────────────────────────────────
if (-not (Run "前端构建 (vite build)" "npm run build")) { exit 1 }

# ── 3. 桌面二进制构建（真正需要链接器；--no-bundle 仅出 exe，跳过安装包）──
if (-not (Run "桌面应用构建 (tauri build --no-bundle)" "npm run tauri build -- --no-bundle")) { exit 1 }

# ── 成功：定位产物 ──────────────────────────────────────────
$exe = Get-ChildItem "src-tauri\target\release\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "  全部验证通过 ✅  Tauri 桌面应用可正常构建" -ForegroundColor Green
if ($exe) { Write-Host "  产物: $($exe.FullName)" -ForegroundColor Green }
Write-Host "==================================================" -ForegroundColor Green
exit 0
