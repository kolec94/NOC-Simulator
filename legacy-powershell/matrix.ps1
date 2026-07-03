# Matrix rain effect for PowerShell. Ctrl+C to exit.
$Host.UI.RawUI.WindowTitle = "The Matrix"
[Console]::CursorVisible = $false
$origBg = [Console]::BackgroundColor
$origFg = [Console]::ForegroundColor
[Console]::BackgroundColor = "Black"
Clear-Host

$chars = @('0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F','X','Y','Z','$','+','-','*','/','<','>','#','@','%','&')

try {
    $width  = [Console]::WindowWidth
    $height = [Console]::WindowHeight

    # per-column drop position, speed, and trail length
    $drops  = New-Object int[] $width
    $speeds = New-Object int[] $width
    for ($x = 0; $x -lt $width; $x++) {
        $drops[$x]  = Get-Random -Minimum (-$height) -Maximum 0
        $speeds[$x] = Get-Random -Minimum 1 -Maximum 3
    }

    $frame = 0
    while ($true) {
        for ($x = 0; $x -lt $width; $x++) {
            if ($frame % $speeds[$x] -eq 0) {
                $y = $drops[$x]

                if ($y -ge 0 -and $y -lt $height) {
                    [Console]::SetCursorPosition($x, $y)
                    [Console]::ForegroundColor = "White"
                    Write-Host -NoNewline ($chars | Get-Random)
                }

                $tail = $y - 1
                if ($tail -ge 0 -and $tail -lt $height) {
                    [Console]::SetCursorPosition($x, $tail)
                    [Console]::ForegroundColor = "Green"
                    Write-Host -NoNewline ($chars | Get-Random)
                }

                $fade = $y - 6
                if ($fade -ge 0 -and $fade -lt $height) {
                    [Console]::SetCursorPosition($x, $fade)
                    [Console]::ForegroundColor = "DarkGreen"
                    Write-Host -NoNewline " "
                }

                $drops[$x]++
                if ($drops[$x] - 6 -gt $height) {
                    $drops[$x]  = Get-Random -Minimum (-$height) -Maximum 0
                    $speeds[$x] = Get-Random -Minimum 1 -Maximum 3
                }
            }
        }
        $frame++
        Start-Sleep -Milliseconds 40
    }
}
finally {
    [Console]::BackgroundColor = $origBg
    [Console]::ForegroundColor = $origFg
    [Console]::CursorVisible = $true
    Clear-Host
}
