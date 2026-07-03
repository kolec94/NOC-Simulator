// Shared contract for all NOC screen templates. Include before the
// template's own script. Exposes window.NOC = { params, rng, color }.
(function () {
    const qs = new URLSearchParams(window.location.search);

    const title = qs.get('title') || 'NOC';

    const seedNum = parseInt(qs.get('seed'), 10);
    const seed = Number.isFinite(seedNum) ? seedNum : 1;

    const hueNum = parseInt(qs.get('hue'), 10);
    const hue = Number.isFinite(hueNum) ? ((hueNum % 360) + 360) % 360 : 120;

    const speedNum = parseFloat(qs.get('speed'));
    const speed = Number.isFinite(speedNum) && speedNum > 0 ? speedNum : 1;

    // mulberry32 seeded PRNG -- deterministic per (seed) so a given
    // screen instance always renders the same "random" layout/data.
    function mulberry32(a) {
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function color(sat, light) {
        const s = sat === undefined ? 100 : sat;
        const l = light === undefined ? 50 : light;
        return `hsl(${hue}, ${s}%, ${l}%)`;
    }

    function setTitle() {
        if (title) document.title = title;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setTitle);
    } else {
        setTitle();
    }

    window.NOC = {
        params: { title, seed, hue, speed },
        rng: mulberry32(seed),
        color
    };
})();
