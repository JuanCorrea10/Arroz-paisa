# ============================================================================
#  publicar.ps1  -  Subir los cambios a internet.
#
#  Los cambios NO se suben solos. Cada vez que arreglemos algo hay que
#  publicarlo, y esto lo hace en un comando:
#
#      .\publicar.cmd "lo que cambio"
#
#  Ojo al ".\" del principio: PowerShell NO busca en la carpeta donde uno esta
#  parado. Sin el, contesta "no se reconoce como nombre de un cmdlet".
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

# --- 2. Cambiar la version -------------------------------------------------
#
#  GitHub guarda cada archivo 10 minutos por su cuenta. Sin esto, justo
#  despues de publicar hay navegadores que se quedan con el HTML nuevo y el
#  CSS viejo, y la pagina no se ve vieja: se ve ROTA.
#
#  Poniendole la version a la direccion (archivo.css?v=...), un archivo nuevo
#  tiene direccion nueva y el navegador no tiene de donde sacar el viejo.
#  Lo hace el computador porque es de esas cosas que uno olvida siempre.

Titulo "Cambiando la version"

$version = Get-Date -Format "yyyyMMdd-HHmm"

# Ojo con como se escriben estos archivos.
#
# "Set-Content -Encoding UTF8" en Windows PowerShell mete un BOM: tres bytes
# invisibles al principio del archivo. En un .html eso es basura ANTES del
# <!doctype>, y algunos navegadores se quejan. Peor: como es invisible, uno
# no lo ve nunca y el script lo volveria a meter en cada publicacion.
#
# Por eso se escribe con .NET pidiendo UTF8 SIN BOM.
$sinBom = New-Object System.Text.UTF8Encoding $false

$rutaHtml = Join-Path $PSScriptRoot "index.html"
$html = [System.IO.File]::ReadAllText($rutaHtml)
$html = [regex]::Replace($html, '<meta name="version" content="[^"]*">', "<meta name=`"version`" content=`"$version`">")
$html = [regex]::Replace($html, '\?v=[0-9-]+', "?v=$version")
[System.IO.File]::WriteAllText($rutaHtml, $html, $sinBom)

$rutaCss = Join-Path $PSScriptRoot "css/pantallas.css"
$css = [System.IO.File]::ReadAllText($rutaCss)
$css = [regex]::Replace($css, '--version: "[^"]*";', "--version: `"$version`";")
[System.IO.File]::WriteAllText($rutaCss, $css, $sinBom)

Write-Host "  Version $version" -ForegroundColor Green

# --- 3. La revision que no se puede olvidar ---------------------------------

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

# --- 4. Que se va a subir ---------------------------------------------------

Titulo "Lo que cambia"
git diff --cached --stat | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" }

# --- 5. El mensaje ----------------------------------------------------------

if (-not $Mensaje) {
    Write-Host ""
    $Mensaje = Read-Host "  En una linea, que cambio"
}
if (-not $Mensaje) {
    Write-Host "  Sin mensaje no se sube: dentro de un mes nadie va a saber que fue esto." -ForegroundColor Yellow
    git reset | Out-Null
    exit 1
}

# --- 6. Subir ---------------------------------------------------------------

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
Write-Host "  (GitHub se demora un minuto. Si no ve el cambio, recargue con" -ForegroundColor DarkGray
Write-Host "   Ctrl+Shift+R, que le pide los archivos de nuevo sin usar los" -ForegroundColor DarkGray
Write-Host "   que tenia guardados.)" -ForegroundColor DarkGray
Write-Host ""
