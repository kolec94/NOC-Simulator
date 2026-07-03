const params = new URLSearchParams(location.search);
let screens = [];
let currentIndex = -1;
let pc = null;
let whepResourceUrl = null;
let hls = null;
let cycleTimer = null;

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const listEl = document.getElementById('screen-list');
const labelEl = document.getElementById('current-label');

async function fetchRunningScreens() {
    const res = await fetch('/api/screens');
    const all = await res.json();
    return all.filter((s) => s.status === 'running');
}

function renderList() {
    listEl.innerHTML = '';
    screens.forEach((s, i) => {
        const li = document.createElement('li');
        li.textContent = s.name;
        li.className = i === currentIndex ? 'active' : '';
        li.addEventListener('click', () => switchTo(i));
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
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
    } else {
        throw new Error('HLS not supported in this browser');
    }
    video.play().catch(() => {});
}

async function switchTo(index) {
    if (index < 0 || index >= screens.length) return;
    currentIndex = index;
    const screen = screens[index];
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
}

function next() { if (screens.length) switchTo((currentIndex + 1) % screens.length); }
function prev() { if (screens.length) switchTo((currentIndex - 1 + screens.length) % screens.length); }

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
        labelEl.textContent = 'No screens currently running -- start one from the admin panel.';
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
        cycleTimer = setInterval(next, cycleSeconds * 1000);
    }
}

init();

setInterval(async () => {
    screens = await fetchRunningScreens();
    renderList();
}, 8000);
