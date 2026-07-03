const crypto = require('crypto');

// 13 templates x ~3 variants each = 40 unique screens.
const TEMPLATES = [
    { file: 'matrix', label: 'MATRIX', count: 3 },
    { file: 'dashboard', label: 'DASHBOARD', count: 3 },
    { file: 'radar', label: 'RADAR', count: 3 },
    { file: 'logfeed', label: 'LOGFEED', count: 3 },
    { file: 'worldmap', label: 'WORLDMAP', count: 3 },
    { file: 'netgraph', label: 'NETGRAPH', count: 3 },
    { file: 'ticker', label: 'TICKER', count: 3 },
    { file: 'waveform', label: 'WAVEFORM', count: 3 },
    { file: 'hexdump', label: 'HEXDUMP', count: 3 },
    { file: 'satellites', label: 'SATELLITES', count: 3 },
    { file: 'rack', label: 'RACK', count: 3 },
    { file: 'heatmap', label: 'HEATMAP', count: 3 },
    { file: 'terminal', label: 'TERMINAL', count: 4 }
];

const TOTAL = TEMPLATES.reduce((sum, t) => sum + t.count, 0);
const SPEEDS = [0.75, 1, 1.25, 1.5];

function buildCatalog(adminHost, port) {
    const base = `http://${adminHost}:${port}/screens`;
    const hueStep = 360 / TOTAL;
    const screens = [];
    let gridNum = 1;

    TEMPLATES.forEach((t) => {
        for (let i = 0; i < t.count; i++) {
            const seed = gridNum * 7 + i * 3 + 1;
            const hue = Math.round((gridNum - 1) * hueStep) % 360;
            const speed = SPEEDS[i % SPEEDS.length];
            const variantLetter = t.count > 1 ? ' ' + String.fromCharCode(65 + i) : '';
            const title = `GRID-${String(gridNum).padStart(2, '0')} // ${t.label}${variantLetter}`;
            const streamPath = `screen${String(gridNum).padStart(2, '0')}`;
            const qs = new URLSearchParams({
                title,
                seed: String(seed),
                hue: String(hue),
                speed: String(speed)
            });

            screens.push({
                id: crypto.randomBytes(4).toString('hex'),
                name: title,
                url: `${base}/${t.file}.html?${qs.toString()}`,
                width: 1280,
                height: 720,
                fps: 15,
                streamPath
            });

            gridNum++;
        }
    });

    return screens;
}

module.exports = { buildCatalog, TOTAL };
