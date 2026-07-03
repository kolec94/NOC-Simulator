const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Docker = require('dockerode');
const { buildCatalog } = require('./seeds');

const PORT = process.env.PORT || 8080;
const CORES = os.cpus().length;
// Rough starting heuristic from measured usage (~10-25% CPU per stream on
// typical screens): a few streams per core. This is only ever a *default*
// seed value -- the real cap is whatever's in settings.json, adjustable
// live from the admin UI slider, with no hardcoded ceiling.
const SUGGESTED_MAX = Math.max(1, CORES * 4);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'screens.json');
const SETTINGS_FILE = process.env.SETTINGS_FILE || path.join(path.dirname(DATA_FILE), 'settings.json');
const CAPTURE_IMAGE = process.env.CAPTURE_IMAGE || 'noc-simulator-capture';
const NETWORK_NAME = process.env.NOC_NETWORK || 'noc-net';
const MEDIAMTX_HOST = process.env.MEDIAMTX_HOST || 'mediamtx';
const MEDIAMTX_RTMP_PORT = process.env.MEDIAMTX_RTMP_PORT || '1935';
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'localhost';
const ADMIN_INTERNAL_HOST = process.env.ADMIN_INTERNAL_HOST || 'admin-panel';
const SCREENS_DIR = process.env.SCREENS_DIR ||
    (fs.existsSync('/screens') ? '/screens' : path.join(__dirname, '..', 'screens'));

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();
app.use(express.json());
app.use('/screens', express.static(SCREENS_DIR));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist')));
app.use('/', express.static(path.join(__dirname, 'public')));

function loadScreens() {
    if (!fs.existsSync(DATA_FILE)) {
        const seeded = buildCatalog(ADMIN_INTERNAL_HOST, PORT);
        saveScreens(seeded);
        return seeded;
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveScreens(screens) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(screens, null, 2));
}

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        const defaults = { maxConcurrent: SUGGESTED_MAX };
        saveSettings(defaults);
        return defaults;
    }
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}

function saveSettings(settings) {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function containerName(id) {
    return `noc-capture-${id}`;
}

function streamUrls(streamPath) {
    // capture.sh always publishes under the "live/" prefix -- keep every
    // playback protocol pointed at the same MediaMTX path.
    return {
        rtsp: `rtsp://${PUBLIC_HOST}:8554/live/${streamPath}`,
        rtmp: `rtmp://${PUBLIC_HOST}:${MEDIAMTX_RTMP_PORT}/live/${streamPath}`,
        hls: `http://${PUBLIC_HOST}:8888/live/${streamPath}/index.m3u8`,
        whep: `http://${PUBLIC_HOST}:8889/live/${streamPath}/whep`
    };
}

async function runningCaptureCount() {
    const containers = await docker.listContainers({
        filters: JSON.stringify({ name: ['noc-capture-'] })
    });
    return containers.length;
}

async function containerStatus(id) {
    try {
        const info = await docker.getContainer(containerName(id)).inspect();
        return info.State.Running ? 'running' : 'stopped';
    } catch (err) {
        if (err.statusCode === 404) return 'stopped';
        throw err;
    }
}

app.get('/api/status', async (req, res) => {
    res.json({
        running: await runningCaptureCount(),
        max: loadSettings().maxConcurrent,
        cores: CORES,
        suggestedMax: SUGGESTED_MAX
    });
});

app.put('/api/settings', (req, res) => {
    const { maxConcurrent } = req.body;
    const value = parseInt(maxConcurrent, 10);
    if (!Number.isInteger(value) || value < 1) {
        return res.status(400).json({ error: 'maxConcurrent must be a positive integer' });
    }
    const settings = { ...loadSettings(), maxConcurrent: value };
    saveSettings(settings);
    res.json(settings);
});

app.get('/api/screens', async (req, res) => {
    const screens = loadScreens();
    const withStatus = await Promise.all(screens.map(async (s) => ({
        ...s,
        status: await containerStatus(s.id),
        urls: streamUrls(s.streamPath)
    })));
    res.json(withStatus);
});

app.post('/api/screens', (req, res) => {
    const { name, url, width, height, fps, streamPath } = req.body;
    if (!name || !url || !streamPath) {
        return res.status(400).json({ error: 'name, url, and streamPath are required' });
    }
    const screens = loadScreens();
    if (screens.some((s) => s.streamPath === streamPath)) {
        return res.status(409).json({ error: `streamPath "${streamPath}" is already in use` });
    }
    const screen = {
        id: crypto.randomBytes(4).toString('hex'),
        name,
        url,
        width: width || 1920,
        height: height || 1080,
        fps: fps || 30,
        streamPath
    };
    screens.push(screen);
    saveScreens(screens);
    res.status(201).json(screen);
});

app.put('/api/screens/:id', (req, res) => {
    const screens = loadScreens();
    const idx = screens.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    const { name, url, width, height, fps, streamPath } = req.body;
    const existing = screens[idx];
    if (streamPath && streamPath !== existing.streamPath &&
        screens.some((s) => s.streamPath === streamPath)) {
        return res.status(409).json({ error: `streamPath "${streamPath}" is already in use` });
    }
    screens[idx] = {
        ...existing,
        name: name ?? existing.name,
        url: url ?? existing.url,
        width: width ?? existing.width,
        height: height ?? existing.height,
        fps: fps ?? existing.fps,
        streamPath: streamPath ?? existing.streamPath
    };
    saveScreens(screens);
    res.json(screens[idx]);
});

app.delete('/api/screens/:id', async (req, res) => {
    const screens = loadScreens();
    const idx = screens.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    await stopCapture(req.params.id).catch(() => {});
    screens.splice(idx, 1);
    saveScreens(screens);
    res.status(204).end();
});

async function stopCapture(id) {
    const container = docker.getContainer(containerName(id));
    try {
        await container.stop({ t: 5 });
    } catch (err) {
        if (err.statusCode !== 404 && err.statusCode !== 304) throw err;
    }
    try {
        await container.remove({ force: true });
    } catch (err) {
        if (err.statusCode !== 404) throw err;
    }
}

app.post('/api/screens/:id/start', async (req, res) => {
    const screens = loadScreens();
    const screen = screens.find((s) => s.id === req.params.id);
    if (!screen) return res.status(404).json({ error: 'not found' });

    const status = await containerStatus(screen.id);
    if (status === 'running') return res.json({ status: 'running' });

    const running = await runningCaptureCount();
    const maxConcurrent = loadSettings().maxConcurrent;
    if (running >= maxConcurrent) {
        return res.status(409).json({
            error: `Concurrent stream limit reached (${running}/${maxConcurrent}). ` +
                'Stop another screen first, or raise the limit with the slider above.'
        });
    }

    await stopCapture(screen.id).catch(() => {});

    const container = await docker.createContainer({
        name: containerName(screen.id),
        Image: CAPTURE_IMAGE,
        Env: [
            `SCREEN_URL=${screen.url}`,
            `STREAM_PATH=${screen.streamPath}`,
            `WIDTH=${screen.width}`,
            `HEIGHT=${screen.height}`,
            `FPS=${screen.fps}`,
            `MEDIAMTX_HOST=${MEDIAMTX_HOST}`,
            `MEDIAMTX_RTMP_PORT=${MEDIAMTX_RTMP_PORT}`
        ],
        HostConfig: {
            NetworkMode: NETWORK_NAME,
            RestartPolicy: { Name: 'unless-stopped' },
            ShmSize: 512 * 1024 * 1024
        }
    });
    await container.start();
    res.json({ status: 'running' });
});

app.post('/api/screens/:id/stop', async (req, res) => {
    const screens = loadScreens();
    const screen = screens.find((s) => s.id === req.params.id);
    if (!screen) return res.status(404).json({ error: 'not found' });
    await stopCapture(screen.id);
    res.json({ status: 'stopped' });
});

app.listen(PORT, () => {
    console.log(`NOC admin panel listening on :${PORT}`);
});
