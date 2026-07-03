# Launches all NOC Simulator screens, each in its own window.
$root = $PSScriptRoot

$screens = @(
    "matrix.ps1",
    "ops-dashboard.ps1",
    "ops-radar.ps1",
    "ops-logfeed.ps1"
)

foreach ($s in $screens) {
    $path = Join-Path $root $s
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$path`""
}
