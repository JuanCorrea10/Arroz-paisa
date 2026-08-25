# ============================================================================
#  publicar.ps1  -  Subir los cambios a internet.
#
#  Los cambios NO se suben solos. Cada vez que arreglemos algo hay que
#  publicarlo, y esto lo hace en un comando:
#
#      .\publicar.ps1 "lo que cambio"
#
#  Antes de subir revisa que no se vaya ningun dato de las personas, porque
#  GitHub Pages es publico y esa revision es facil de olvidar cuando uno anda
#  de afan. Por eso la hace el computador y no uno.
# ============================================================================

param(
    [Parameter(Mandatory = $false, Position = 0)]
    [string]$Mensaje = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Titulo($texto) {
    Write-Host ""
    Write-Host "  $texto" -ForegroundColor Magenta
    Write-Host ""
}

# --- 1. ¿Hay algo que subir? ------------------------------------------------

$sinSubir = git status --porcelain
$commitsPendientes = git log --oneline origin/main..HEAD 2>$null

if (-not $sinSubir -and -not $commitsPendientes) {
    Titulo "No hay nada nuevo que publicar."
    exit 0
}

# --- 2. La revision que no se puede olvidar ---------------------------------

Titulo "Revisando que no se vaya nada privado"

git add -A | Out-Null

$peligrosos = git diff --cached --name-only | Where-Object {
    $_ -match '\.(xlsx|xls|ods|csv)$' -or
    $_ -match 'inicial\.json' -or
    $_ -match 'datos\.json' -or
    $_ -match 'personal-' -or
    $_ -match 'respaldo-'
} | Where-Object { $_ -notmatch '^vendor/' }

if ($peligrosos) {
    Write-Host "  SE DETUVO: estos archivos llevan datos de personas y NO pueden subir:" -ForegroundColor Red
    $peligrosos | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Agreguelos al .gitignore y vuelva a intentar." -ForegroundColor Red
    git reset | Out-Null
    exit 1
}

Write-Host "  Ningun dato de personas. Se puede subir." -ForegroundColor Green

# --- 3. Que se va a subir ---------------------------------------------------

Titulo "Lo que cambia"
git diff --cached --stat | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" }

# --- 4. El mensaje ----------------------------------------------------------

if (-not $Mensaje) {
    Write-Host ""
    $Mensaje = Read-Host "  En una linea, que cambio"
}
if (-not $Mensaje) {
    Write-Host "  Sin mensaje no se sube: dentro de un mes nadie va a saber que fue esto." -ForegroundColor Yellow
    git reset | Out-Null
    exit 1
}

# --- 5. Subir ---------------------------------------------------------------

if ($sinSubir) {
    git commit -q -m $Mensaje
    Write-Host ""
    Write-Host "  Guardado: $Mensaje" -ForegroundColor Green
}

Titulo "Subiendo a GitHub"
git push origin main

Write-Host ""
Write-Host "  Listo. En un minuto se ve el cambio en:" -ForegroundColor Green
Write-Host "     https://juancorrea10.github.io/Arroz-paisa/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  (GitHub se demora un poco en actualizar la pagina. Si no ve el" -ForegroundColor DarkGray
Write-Host "   cambio, espere un minuto y recargue con Ctrl+Shift+R.)" -ForegroundColor DarkGray
Write-Host ""
