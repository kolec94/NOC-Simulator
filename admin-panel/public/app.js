async function fetchScreens() {
    const [screensRes, statusRes] = await Promise.all([
        fetch('/api/screens'),
        fetch('/api/status')
    ]);
    render(await screensRes.json());
    renderStatus(await statusRes.json());
}

const slider = document.getElementById('max-slider');
const numberInput = document.getElementById('max-number');
let editingMax = false;
slider.addEventListener('focus', () => { editingMax = true; });
numberInput.addEventListener('focus', () => { editingMax = true; });
slider.addEventListener('blur', () => { editingMax = false; });
numberInput.addEventListener('blur', () => { editingMax = false; });

function renderStatus(status) {
    const el = document.getElementById('status-banner');
    el.textContent = `${status.running} / ${status.max} capture streams running`;
    el.className = status.running >= status.max ? 'banner-full' : 'banner-ok';

    document.getElementById('max-suggested').textContent =
        `(${status.cores} cores detected -- suggested default: ${status.suggestedMax})`;

    if (!editingMax) {
        const ceiling = Math.max(status.max, status.suggestedMax) * 3;
        slider.max = ceiling;
        numberInput.max = ceiling;
        slider.value = status.max;
        numberInput.value = status.max;
    }
}

async function updateMaxConcurrent(value) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = '';
    try {
        const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxConcurrent: value })
        });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

slider.addEventListener('input', () => { numberInput.value = slider.value; });
slider.addEventListener('change', () => updateMaxConcurrent(Number(slider.value)));
numberInput.addEventListener('change', () => {
    slider.value = numberInput.value;
    updateMaxConcurrent(Number(numberInput.value));
});

function render(screens) {
    const rows = document.getElementById('rows');
    rows.innerHTML = '';
    screens.forEach((s) => {
        const tr = document.createElement('tr');
        const running = s.status === 'running';
        tr.innerHTML = `
            <td>${s.name}</td>
            <td>${s.url}</td>
            <td>${s.width}x${s.height}</td>
            <td>${s.fps}</td>
            <td>${s.streamPath}</td>
            <td class="status-${s.status}">${s.status}</td>
            <td class="urls">
                RTSP: <code>${s.urls.rtsp}</code><br>
                RTMP: <code>${s.urls.rtmp}</code><br>
                HLS: <code>${s.urls.hls}</code>
            </td>
            <td>
                <a href="/viewer.html?path=${encodeURIComponent(s.streamPath)}" target="_blank" ${running ? '' : 'style="pointer-events:none;opacity:0.4"'}>Watch</a>
            </td>
            <td>
                <button data-action="start" data-id="${s.id}" ${running ? 'disabled' : ''}>Start</button>
                <button data-action="stop" data-id="${s.id}" ${!running ? 'disabled' : ''}>Stop</button>
                <button data-action="delete" data-id="${s.id}" class="danger">Delete</button>
            </td>
        `;
        rows.appendChild(tr);
    });
}

document.getElementById('rows').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const errorEl = document.getElementById('error');
    errorEl.textContent = '';
    try {
        if (action === 'delete') {
            if (!confirm('Delete this screen?')) return;
            await fetch(`/api/screens/${id}`, { method: 'DELETE' });
        } else {
            const res = await fetch(`/api/screens/${id}/${action}`, { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        }
        await fetchScreens();
    } catch (err) {
        errorEl.textContent = err.message;
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
    const errorEl = document.getElementById('error');
    errorEl.textContent = '';
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
        errorEl.textContent = err.message;
    }
});

fetchScreens();
setInterval(fetchScreens, 4000);
