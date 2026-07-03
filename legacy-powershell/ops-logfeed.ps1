# Scrolling hacker-style log feed. Ctrl+C to exit.
$Host.UI.RawUI.WindowTitle = "OPS - LOG FEED"
[Console]::BackgroundColor = "Black"
[Console]::ForegroundColor = "Green"
Clear-Host

$procs = "auth-svc","gateway","ingest-worker","cache-node","sched","webui","ollama-rt","tsnet","balloon-drv","update-daemon"
$actions = "handshake complete","heartbeat ok","memory page synced","request routed","token refreshed","block committed","cache hit","gc cycle complete","peer reconnected","config reloaded"
$hosts = @("10.0.4.12","10.0.4.19","100.72.137.71","192.168.8.207","10.0.7.101")

function New-Hex($len) {
    -join ((1..$len) | ForEach-Object { "{0:x}" -f (Get-Random -Minimum 0 -Maximum 16) })
}

try {
    while ($true) {
        $ts = Get-Date -Format "HH:mm:ss.fff"
        $roll = Get-Random -Minimum 1 -Maximum 100

        if ($roll -le 6) {
            Write-Host ("[$ts] WARN  " + ($procs | Get-Random) + " retry backoff triggered (attempt $(Get-Random -Minimum 1 -Maximum 4))") -ForegroundColor Yellow
        } elseif ($roll -le 9) {
            Write-Host ("[$ts] ALERT " + ($procs | Get-Random) + " threshold exceeded on " + ($hosts | Get-Random)) -ForegroundColor Red
        } else {
            $p = $procs | Get-Random
            $a = $actions | Get-Random
            $h = $hosts | Get-Random
            $hex = New-Hex 12
            Write-Host ("[$ts] OK    {0,-14} {1,-26} host={2,-15} tx=0x{3}" -f $p, $a, $h, $hex) -ForegroundColor Green
        }

        Start-Sleep -Milliseconds (Get-Random -Minimum 80 -Maximum 260)
    }
}
finally {
    Clear-Host
}
