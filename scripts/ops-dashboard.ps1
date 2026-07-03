# Live gauge dashboard. Ctrl+C to exit.
$Host.UI.RawUI.WindowTitle = "OPS - SYSTEM STATUS"
[Console]::CursorVisible = $false
[Console]::BackgroundColor = "Black"
[Console]::ForegroundColor = "Gray"
Clear-Host

function Draw-Bar($value, $width) {
    $filled = [Math]::Floor(($value / 100.0) * $width)
    $bar = ("#" * $filled).PadRight($width, '.')
    return $bar
}

$labels = "CPU","MEM","NET","GPU","PWR","I/O"
$values = @{}
foreach ($l in $labels) { $values[$l] = Get-Random -Minimum 20 -Maximum 80 }

try {
    while ($true) {
        [Console]::SetCursorPosition(0,0)
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.AppendLine("================================================================")
        [void]$sb.AppendLine("                OPERATIONS STATUS - LIVE TELEMETRY             ")
        [void]$sb.AppendLine("================================================================")
        [void]$sb.AppendLine(" TIME: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
        [void]$sb.AppendLine("----------------------------------------------------------------")

        foreach ($l in $labels) {
            $delta = Get-Random -Minimum -8 -Maximum 9
            $values[$l] = [Math]::Min(99, [Math]::Max(5, $values[$l] + $delta))
            $bar = Draw-Bar $values[$l] 40
            $pct = "{0,3}" -f $values[$l]
            [void]$sb.AppendLine((" {0,-4} [{1}] {2}%" -f $l, $bar, $pct))
        }

        [void]$sb.AppendLine("----------------------------------------------------------------")
        $statuses = "NOMINAL","NOMINAL","NOMINAL","STANDBY","NOMINAL"
        $status = $statuses | Get-Random
        [void]$sb.AppendLine(" LINK STATUS: $status      NODES ONLINE: $(Get-Random -Minimum 6 -Maximum 12)/12")
        [void]$sb.AppendLine(" UPTIME: $([TimeSpan]::FromSeconds((Get-Random -Minimum 100000 -Maximum 900000)).ToString())")
        [void]$sb.AppendLine("================================================================")

        Write-Host $sb.ToString()
        Start-Sleep -Milliseconds 700
    }
}
finally {
    [Console]::CursorVisible = $true
    Clear-Host
}
