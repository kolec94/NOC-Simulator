# NOC Simulator

A set of PowerShell scripts that turn a wall of terminal windows into a fake
Network Operations Center — matrix-style code rain, a live telemetry
dashboard, a radar sweep, and a scrolling system log feed. Built for the
"multiple monitors, looks like mission control" aesthetic.

## Screens

| Script | Description |
|---|---|
| `scripts/matrix.ps1` | Classic falling-code rain effect |
| `scripts/ops-dashboard.ps1` | Live gauges for CPU/MEM/NET/GPU/PWR/I-O with fluctuating values |
| `scripts/ops-radar.ps1` | ASCII radar sweep with rotating beam and fixed contacts |
| `scripts/ops-logfeed.ps1` | Scrolling log feed with OK/WARN/ALERT lines |

## Usage

Run all four at once, each in its own window:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-NOC.ps1
```

Or run any single screen on its own:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ops-radar.ps1
```

Ctrl+C in a window stops that screen and restores the terminal.

All scripts use ASCII-only characters by design — PowerShell 5.1 can
misparse non-ASCII glyphs in `.ps1` files depending on encoding, so extended
Unicode (box-drawing characters, katakana, etc.) is avoided throughout.
