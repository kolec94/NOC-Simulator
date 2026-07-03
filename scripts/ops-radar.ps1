# ASCII radar sweep. Ctrl+C to exit.
$Host.UI.RawUI.WindowTitle = "OPS - RADAR"
[Console]::CursorVisible = $false
[Console]::BackgroundColor = "Black"
Clear-Host

$w = 61
$h = 25
$cx = [Math]::Floor($w / 2)
$cy = [Math]::Floor($h / 2)
$radius = [Math]::Min($cx, $cy) - 1

# fixed blips: x,y,label
$blips = @(
    @{x = $cx + 8;  y = $cy - 4; label = "T-01"},
    @{x = $cx - 10; y = $cy + 3; label = "T-02"},
    @{x = $cx + 3;  y = $cy + 7; label = "T-03"},
    @{x = $cx - 6;  y = $cy - 8; label = "T-04"}
)

$angle = 0.0

try {
    while ($true) {
        $grid = New-Object 'char[,]' $h, $w
        for ($y = 0; $y -lt $h; $y++) {
            for ($x = 0; $x -lt $w; $x++) {
                $dx = $x - $cx
                $dy = ($y - $cy) * 2
                $dist = [Math]::Sqrt($dx*$dx + $dy*$dy)
                if ([Math]::Abs($dist - $radius) -lt 0.7 -or [Math]::Abs($dist - $radius/2) -lt 0.7) {
                    $grid[$y,$x] = '.'
                } elseif ($x -eq $cx -or $y -eq $cy) {
                    $grid[$y,$x] = '.'
                } else {
                    $grid[$y,$x] = ' '
                }
            }
        }

        # sweep line
        for ($r = 0; $r -lt $radius; $r += 0.3) {
            $sx = [Math]::Round($cx + $r * [Math]::Cos($angle))
            $sy = [Math]::Round($cy + ($r * [Math]::Sin($angle)) / 2)
            if ($sx -ge 0 -and $sx -lt $w -and $sy -ge 0 -and $sy -lt $h) {
                $grid[$sy,$sx] = '*'
            }
        }

        [Console]::SetCursorPosition(0,0)
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.AppendLine("================ RADAR SWEEP - SECTOR 7 ================")
        for ($y = 0; $y -lt $h; $y++) {
            $row = New-Object System.Text.StringBuilder
            for ($x = 0; $x -lt $w; $x++) {
                $isBlip = $false
                foreach ($b in $blips) {
                    if ($b.x -eq $x -and $b.y -eq $y) { $isBlip = $true }
                }
                $cell = $grid[$y,$x]
                if ($isBlip) { [void]$row.Append('O') }
                else { [void]$row.Append($cell) }
            }
            [void]$sb.AppendLine($row.ToString())
        }
        [void]$sb.AppendLine("==========================================================")
        [void]$sb.AppendLine(" CONTACTS: $($blips.Count)   BEARING: $([Math]::Round(($angle * 180 / [Math]::PI) % 360))deg   SWEEP ACTIVE")

        Write-Host $sb.ToString()

        $angle += 0.2
        Start-Sleep -Milliseconds 90
    }
}
finally {
    [Console]::CursorVisible = $true
    Clear-Host
}
