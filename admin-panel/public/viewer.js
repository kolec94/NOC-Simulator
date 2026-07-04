const params = new URLSearchParams(location.search);
let screens = [];
let currentPath = null;
let pc = null;
let whepResourceUrl = null;
let hls = null;
let cycleTimer = null;
let switching = false;

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const listEl = document.getElementById('screen-list');
const labelEl = document.getElementById('current-label');
const rotateToggle = document.getElementById('rotate-toggle');
const rotateInterval = document.getElementById('rotate-interval');

const SKIP_KEY = 'noc-viewer-rotate-skip';
let skipSet = new Set(JSON.parse(localStorage.getItem(SKIP_KEY) || '[]'));

function saveSkipSet() {
    localStorage.setItem(SKIP_KEY, JSON.stringify([...skipSet]));
}

function currentIndex() {
    return screens.findIndex((s) => s.streamPath === currentPath);
}

async function fetchRunningScreens() {
    const res = await fetch('/api/screens');
    const all = await res.json();
    return all.filter((s) => s.status === 'running');
}

function renderList() {
    listEl.innerHTML = '';
    screens.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = s.streamPath === currentPath ? 'active' : '';

        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.title = 'Skip during auto-rotate';
        checkbox.checked = skipSet.has(s.streamPath);
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) skipSet.add(s.streamPath);
            else skipSet.delete(s.streamPath);
            saveSkipSet();
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(s.name));
        label.addEventListener('click', (e) => {
            if (e.target === checkbox) return;
            switchTo(i);
        });

        li.appendChild(label);
        listEl.appendChild(li);
    });
}

async function stopPlayback() {
    if (pc) {
        pc.close();
        pc = null;
    }
    if (whepResourceUrl) {
        fetch(whepResourceUrl, { method: 'DELETE' }).catch(() => {});
        whepResourceUrl = null;
    }
    if (hls) {
        hls.destroy();
        hls = null;
    }
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
}

async function playWhep(streamPath) {
    const whepUrl = `http://${location.hostname}:8889/live/${streamPath}/whep`;
    pc = new RTCPeerConnection();
    pc.addTransceiver('video', { direction: 'recvonly' });

    const remoteStream = new MediaStream();
    video.srcObject = remoteStream;
    pc.ontrack = (event) => {
        remoteStream.addTrack(event.track);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const res = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp
    });
    if (!res.ok) throw new Error('WHEP POST failed: ' + res.status);

    const location_ = res.headers.get('Location');
    whepResourceUrl = location_ && !location_.startsWith('http')
        ? new URL(location_, whepUrl).toString()
        : location_;

    const answerSdp = await res.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WHEP connect timeout')), 6000);
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                clearTimeout(timeout);
                resolve();
            } else if (pc.iceConnectionState === 'failed') {
                clearTimeout(timeout);
                reject(new Error('ICE connection failed'));
            }
        };
    });
}

function playHls(streamPath) {
    const url = `http://${location.hostname}:8888/live/${streamPath}/index.m3u8`;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
    } else if (window.Hls && Hls.isSupported()) {
        // MediaMTX's HLS delivery relies on a session cookie (its
        // "cookieCheck" redirect) to keep a viewer bound to one internal
        // muxer session. The page (admin-panel, :8080) and the HLS server
        // (mediamtx, :8888) are different origins, so that cookie is only
        // sent if requests are made with credentials.
        hls = new Hls({
            xhrSetup: (xhr) => { xhr.withCredentials = true; }
        });
        hls.loadSource(url);
        hls.attachMedia(video);
    } else {
        throw new Error('HLS not supported in this browser');
    }
    video.play().catch(() => {});
}

async function switchTo(index) {
    if (index < 0 || index >= screens.length) return;
    // WHEP negotiation takes a moment; overlapping switches (rotation
    // timer + arrow keys + clicks) would race each other and wedge
    // playback, so drop any switch requested mid-switch.
    if (switching) return;
    switching = true;
    try {
        const screen = screens[index];
        currentPath = screen.streamPath;
        labelEl.textContent = screen.name;
        renderList();
        await stopPlayback();

        try {
            await playWhep(screen.streamPath);
            video.play().catch(() => {});
        } catch (err) {
            console.warn('WHEP failed for', screen.streamPath, '-- falling back to HLS:', err);
            await stopPlayback();
            try {
                playHls(screen.streamPath);
            } catch (err2) {
                labelEl.textContent = screen.name + ' (playback failed)';
                console.error(err2);
            }
        }

        history.replaceState(null, '', `?path=${encodeURIComponent(screen.streamPath)}`);
    } finally {
        switching = false;
    }
}

function next() {
    if (!screens.length) return;
    switchTo((currentIndex() + 1) % screens.length);
}
function prev() {
    if (!screens.length) return;
    switchTo((currentIndex() - 1 + screens.length) % screens.length);
}

function rotateNext() {
    const candidates = screens
        .map((s, i) => i)
        .filter((i) => !skipSet.has(screens[i].streamPath));
    if (!candidates.length) return;
    const pos = candidates.indexOf(currentIndex());
    const nextPos = pos === -1 ? 0 : (pos + 1) % candidates.length;
    switchTo(candidates[nextPos]);
}

function startRotation() {
    stopRotation();
    const seconds = parseFloat(rotateInterval.value);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    cycleTimer = setInterval(rotateNext, seconds * 1000);
}

function stopRotation() {
    if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
    }
}

rotateToggle.addEventListener('change', () => {
    if (rotateToggle.checked) startRotation();
    else stopRotation();
});
rotateInterval.addEventListener('change', () => {
    if (rotateToggle.checked) startRotation();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
});

let hideTimer;
function showOverlay() {
    overlay.classList.remove('hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => overlay.classList.add('hidden'), 4000);
}
document.addEventListener('mousemove', showOverlay);
showOverlay();

async function init() {
    screens = await fetchRunningScreens();
    renderList();

    if (screens.length === 0) {
        labelEl.textContent = 'No screens currently running — start one from the admin panel.';
        return;
    }

    const wantPath = params.get('path');
    let startIndex = 0;
    if (wantPath) {
        const found = screens.findIndex((s) => s.streamPath === wantPath);
        if (found >= 0) startIndex = found;
    }
    await switchTo(startIndex);

    const cycleSeconds = parseFloat(params.get('cycle'));
    if (Number.isFinite(cycleSeconds) && cycleSeconds > 0) {
        rotateInterval.value = cycleSeconds;
        rotateToggle.checked = true;
        startRotation();
    }
}

init();

setInterval(async () => {
    try {
        screens = await fetchRunningScreens();
        renderList();
    } catch { /* transient poll failure */ }
}, 8000);

// Stall watchdog: if the publisher restarts (or a WHEP session half-dies),
// the video track ends silently and the last frame stays on screen forever.
// Detect "playback time not advancing" and re-negotiate the current stream.
let lastTime = -1;
let stallTicks = 0;
setInterval(() => {
    if (document.hidden || switching || !screens.length || currentPath === null) {
        stallTicks = 0;
        return;
    }
    if (video.currentTime === lastTime) {
        stallTicks++;
    } else {
        stallTicks = 0;
    }
    lastTime = video.currentTime;
    if (stallTicks >= 3) {
        stallTicks = 0;
        const idx = currentIndex();
        if (idx >= 0) {
            console.warn('Playback stalled -- reconnecting', currentPath);
            switchTo(idx);
        } else if (screens.length) {
            switchTo(0);
        }
    }
}, 3000);
