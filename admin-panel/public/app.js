const grid = document.getElementById('grid');
const errorEl = document.getElementById('error');
const slider = document.getElementById('max-slider');
const numberInput = document.getElementById('max-number');

let editingMax = false;
slider.addEventListener('focus', () => { editingMax = true; });
numberInput.addEventListener('focus', () => { editingMax = true; });
slider.addEventListener('blur', () => { editingMax = false; });
numberInput.addEventListener('blur', () => { editingMax = false; });

let toastTimer;
function toast(message, kind = 'error') {
    errorEl.textContent = message;
    errorEl.className = `toast ${kind === 'info' ? 'info' : ''}`;
    errorEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { errorEl.hidden = true; }, 6000);
}

async function fetchScreens() {
    try {
        const [screensRes, statusRes] = await Promise.all([
            fetch('/api/screens'),
            fetch('/api/status')
        ]);
        render(await screensRes.json());
        renderStatus(await statusRes.json());
    } catch (err) {
        /* transient poll failure -- leave current UI in place */
    }
}

function renderStatus(status) {
    const el = document.getElementById('status-banner');
    el.textContent = `${status.running} / ${status.max} streams live`;
    el.className = 'chip ' + (status.running >= status.max ? 'banner-full' : 'banner-ok');

    document.getElementById('max-suggested').textContent =
        `${status.cores} cores detected — suggested max: ${status.suggestedMax}`;

    if (!editingMax) {
        const ceiling = Math.max(status.max, status.suggestedMax) * 3;
        slider.max = ceiling;
        numberInput.max = ceiling;
        slider.value = status.max;
        numberInput.value = status.max;
    }
}

async function updateMaxConcurrent(value) {
    try {
        const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxConcurrent: value })
        });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    } catch (err) {
        toast(err.message);
    }
}

slider.addEventListener('input', () => { numberInput.value = slider.value; });
slider.addEventListener('change', () => updateMaxConcurrent(Number(slider.value)));
numberInput.addEventListener('change', () => {
    slider.value = numberInput.value;
    updateMaxConcurrent(Number(numberInput.value));
});

function urlChip(label, value) {
    return `<button class="url-chip" data-copy="${value}" title="${value} — click to copy">${label}</button>`;
}

function render(screens) {
    grid.innerHTML = '';
    screens.forEach((s) => {
        const running = s.status === 'running';
        const card = document.createElement('div');
        card.className = `card is-${s.status}`;
        card.innerHTML = `
            <div class="card-head">
                <div class="card-title" title="${s.name}">${s.name}</div>
                <span class="pill pill-${s.status}">${s.status}</span>
            </div>
            <div class="card-meta">
                <span>${s.width}×${s.height}</span>
                <span>${s.fps} fps</span>
                <span>${s.streamPath}</span>
            </div>
            <div class="card-urls">
                ${urlChip('RTSP', s.urls.rtsp)}
                ${urlChip('RTMP', s.urls.rtmp)}
                ${urlChip('HLS', s.urls.hls)}
                ${urlChip('WHEP', s.urls.whep)}
            </div>
            <div class="card-actions">
                <button class="btn btn-sm ${running ? '' : 'btn-primary'}"
                        data-action="${running ? 'stop' : 'start'}" data-id="${s.id}">
                    ${running ? '■ Stop' : '▶ Start'}
                </button>
                <a class="watch-link ${running ? '' : 'disabled'}"
                   href="/viewer.html?path=${encodeURIComponent(s.streamPath)}" target="_blank">Watch →</a>
                <span class="spacer"></span>
                <button class="btn btn-sm btn-danger-ghost" data-action="delete" data-id="${s.id}">✕</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

grid.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.url-chip');
    if (copyBtn) {
        try {
            await navigator.clipboard.writeText(copyBtn.dataset.copy);
            copyBtn.classList.add('copied');
            setTimeout(() => copyBtn.classList.remove('copied'), 1200);
        } catch { toast('Clipboard unavailable'); }
        return;
    }

    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    try {
        if (action === 'delete') {
            if (!confirm('Delete this screen?')) return;
            await fetch(`/api/screens/${id}`, { method: 'DELETE' });
        } else {
            btn.disabled = true;
            const res = await fetch(`/api/screens/${id}/${action}`, { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        }
        await fetchScreens();
    } catch (err) {
        toast(err.message);
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('start-all').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Starting…';
    try {
        const res = await fetch('/api/screens/start-all', { method: 'POST' });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        const { started, alreadyRunning, skipped, failed } = await res.json();
        const parts = [`started ${started}`];
        if (alreadyRunning) parts.push(`${alreadyRunning} already live`);
        if (skipped) parts.push(`${skipped} over the concurrency cap`);
        if (failed) parts.push(`${failed} failed`);
        toast(parts.join(', '), skipped || failed ? 'error' : 'info');
        await fetchScreens();
    } catch (err) {
        toast(err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '▶ Start All';
    }
});

document.getElementById('stop-all').addEventListener('click', async (e) => {
    if (!confirm('Stop ALL running screens?')) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Stopping…';
    try {
        const res = await fetch('/api/screens/stop-all', { method: 'POST' });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        const { stopped, failed } = await res.json();
        toast(`Stopped ${stopped}${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'info');
        await fetchScreens();
    } catch (err) {
        toast(err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '■ Stop All';
    }
});

document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {
        name: form.name.value,
        url: form.url.value,
        width: Number(form.width.value),
        height: Number(form.height.value),
        fps: Number(form.fps.value),
        streamPath: form.streamPath.value
    };
    try {
        const res = await fetch('/api/screens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        form.reset();
        form.width.value = 1920;
        form.height.value = 1080;
        form.fps.value = 30;
        await fetchScreens();
    } catch (err) {
        toast(err.message);
    }
});

fetchScreens();
setInterval(fetchScreens, 4000);
