// Shared by the homepage and the plugin pages. Every part checks for its own
// markup, so a page only gets the pieces it has.

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(pointer: fine)').matches;
const ROOT = document.documentElement.dataset.root || '.';

gsap.registerPlugin(ScrollTrigger);

// ─── Smooth scroll ───────────────────────────────────────────────────────
const lenis = REDUCED ? null : new Lenis({
    duration: 1.1,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
});
if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
}

function scrollToTarget(target) {
    // The curtain footer is fixed, so "scroll to it" means "scroll to the end".
    const y = target === 'end' ? document.documentElement.scrollHeight
            : target === 0 ? 0
            : target.getBoundingClientRect().top + window.scrollY;
    if (lenis) lenis.scrollTo(y, { duration: 1.4 });
    else window.scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
}

document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (id === 'top' || id === '') { e.preventDefault(); scrollToTarget(0); return; }
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    scrollToTarget(el.classList.contains('footer') ? 'end' : el);
});

// ─── Wave canvases ───────────────────────────────────────────────────────
// A gift box drawn as the relief source: red channel lifts the lines, green
// tints them with the accent (the ribbon).
function drawGiftBox(ctx, W, H, at = 0.5) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.filter = 'blur(5px)';
    const cx = W * at, bw = W * 0.34, bh = H * 0.36, by = H * 0.44, lidH = H * 0.1;
    ctx.fillStyle = 'rgb(170,0,0)';
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, by, bw, bh, 10); ctx.fill();
    ctx.fillStyle = 'rgb(255,0,0)';
    ctx.beginPath(); ctx.roundRect(cx - bw * 0.56, by - lidH, bw * 1.12, lidH, 8); ctx.fill();
    ctx.fillStyle = 'rgb(255,255,0)';
    ctx.fillRect(cx - bw * 0.07, by - lidH, bw * 0.14, bh + lidH);
    ctx.lineWidth = W * 0.022;
    ctx.strokeStyle = 'rgb(255,255,0)';
    ctx.beginPath(); ctx.ellipse(cx - bw * 0.15, by - lidH - H * 0.05, bw * 0.13, H * 0.045, -0.35, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + bw * 0.15, by - lidH - H * 0.05, bw * 0.13, H * 0.045, 0.35, 0, Math.PI * 2); ctx.stroke();
}

const WAVE_PRESETS = {
    // Not interactive: the pointer shouldn't pull the face around.
    portrait: () => ({ source: ROOT + '/assets/images/hero-1920.webp', photo: true, narrowZoom: 1.35, interactive: false,
                       gap: 9, relief: 1.1, amp: 0.75, form: 0, reveal: 0,
                       // A skull over the face. Positions are fractions of the
                       // photo's width/height (it's 2752×1536, so x radii look
                       // wider than they read).
                       glitch: { x: 0.5, y: 0.37, rx: 0.126, ry: 0.235,      // cranium
                                 jaw: [0.5, 0.6, 0.08, 0.115],
                                 nose: [0.5015, 0.45, 0.028, 0.075],          // top x/y, half-width, height
                                 mouth: [0.5, 0.6, 0.046, 0.017],
                                 eyes: { left: [0.4485, 0.42], right: [0.5515, 0.42], size: [0.036, 0.034] } } }),
    box:      () => ({ draw: drawGiftBox, gap: 7, mobileGap: 6, relief: 2.6, amp: 0.45 }),
    calmHero: () => ({ amp: 0.9, reveal: 0 }),
    calm:     () => ({ amp: 1.1, interactive: true }),
};

const waves = new Map(); // canvas → WaveLines
if (window.WaveLines) {
    document.querySelectorAll('[data-waves]').forEach(c => {
        const preset = WAVE_PRESETS[c.dataset.waves];
        if (preset) waves.set(c, new WaveLines(c, preset()));
    });
}
const heroWaves = () => waves.get(document.querySelector('.hero__waves'));

// ─── Intro ───────────────────────────────────────────────────────────────
// First page of a session: the W·A·K loader counts to 100, the icon drops
// out, K closes up on W and the "WK" flies into the header logo. Every other
// page washes in from the left. Then the hero lines sweep in, the subject
// rises out of them and the title slides up.
const HTML = document.documentElement;

function intro() {
    const hero = heroWaves();
    const lines = gsap.utils.toArray('.hero__title .line > span');
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        document.body.classList.remove('is-intro');
        try { sessionStorage.setItem('wk-visited', '1'); } catch (e) {}
        lenis?.start();
        ScrollTrigger.refresh();
        revealHeroText(0);
    };
    const skipAll = () => {
        document.querySelector('.loader')?.remove();
        HTML.classList.remove('is-first', 'is-return');
        if (hero) { hero.reveal = 1; hero.form = 1; hero.redraw(); }
        finish();
    };
    // Whatever happens (slow image, stalled tween), never hold the page.
    setTimeout(() => { if (!done) skipAll(); }, 15000);

    if (REDUCED) { skipAll(); return; }

    lenis?.stop();
    gsap.set(lines, { yPercent: 110 });
    gsap.set('.hero__stack figure', { y: 90, opacity: 0 });

    const heroIn = () => {
        const tl = gsap.timeline();
        if (hero) {
            tl.to(hero, { reveal: 1, duration: 1.4, ease: 'power2.inOut' }, 0);
            hero.ready.then(() => tl.to(hero, { form: 1, duration: 2.2, ease: 'expo.inOut' }, Math.max(tl.time(), 0.4)));
        }
        tl.add(finish, 0.7);
    };

    if (HTML.classList.contains('is-first') && document.querySelector('.loader')) runLoader(hero).then(heroIn);
    else { revealWash(); heroIn(); }
}

function runLoader(hero) {
    const loader = document.querySelector('.loader');
    const mark = loader.querySelector('.loader__mark');
    const icon = loader.querySelector('.loader__a');
    const fill = loader.querySelector('.loader__fill');
    const num = loader.querySelector('.loader__num');
    const bar = loader.querySelector('.loader__bar i');
    const logo = document.querySelector('.nav__logo-text');
    const MIN = 2600, MAX = 12000;
    const start = performance.now();
    let ready = false;
    // Wait for everything on the page (images, including the first showreel
    // screenshot, and fonts) plus the hero photo. MAX is only a safety net.
    const pageLoaded = document.readyState === 'complete' ? null
        : new Promise(r => window.addEventListener('load', r, { once: true }));
    Promise.all([hero?.ready, document.fonts?.ready, pageLoaded]).then(() => { ready = true; });
    // The hero is hidden under the loader; don't spend frames drawing it.
    if (hero) hero.paused = true;

    // The icon fills with colour like water, bottom to top, with a moving
    // surface that's calm when empty and when full.
    const water = (p, t) => {
        const level = 104 - p * 110;
        const amp = 3.5 * Math.sin(Math.PI * Math.min(p, 1)) + 0.4;
        const pts = [];
        for (let x = 0; x <= 100; x += 5) {
            const y = level + Math.sin(x * 0.11 + t * 0.005) * amp + Math.sin(x * 0.23 - t * 0.0032) * amp * 0.4;
            pts.push(`${x}% ${y.toFixed(2)}%`);
        }
        fill.style.clipPath = `polygon(${pts.join(', ')}, 100% 100%, 0% 100%)`;
    };

    gsap.fromTo('.loader__l > *', { yPercent: 110 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 });
    gsap.fromTo(['.loader__label', '.loader__num', '.loader__bar'], { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.4 });

    return new Promise(resolve => {
        let shown = 0;
        // Time drives the count. It only goes past 90 once the page is ready
        // (or MAX has passed), and it always reaches 100.
        const tick = () => {
            const t = performance.now() - start;
            const cap = ready || t > MAX ? 100 : 90;
            const target = Math.min(cap, (t / MIN) * 100);
            shown += (target - shown) * 0.12;
            if (target >= 100 && shown > 99.5) shown = 100;
            num.textContent = String(Math.round(shown)).padStart(3, '0');
            bar.style.transform = `scaleX(${shown / 100})`;
            water(shown / 100, t);
            if (shown < 100) requestAnimationFrame(tick); else land();
        };
        requestAnimationFrame(tick);

        function land() {
            // Pin W where it is, so only K moves as the icon collapses.
            const r = mark.getBoundingClientRect();
            gsap.set(mark, { position: 'absolute', left: r.left, top: r.top, margin: 0 });
            gsap.timeline()
                .to(['.loader__label', '.loader__num', '.loader__bar'], { opacity: 0, duration: 0.4 }, 0.1)
                .to(icon, { width: 0, marginLeft: 0, marginRight: 0, opacity: 0, scale: 0.3, duration: 0.8, ease: 'expo.inOut' }, 0.15)
                .add(() => {
                    // FLIP the joined "WK" onto the header logo.
                    const from = mark.getBoundingClientRect();
                    const to = logo.getBoundingClientRect();
                    gsap.to(mark, {
                        x: to.left - from.left, y: to.top - from.top, scale: to.height / from.height,
                        transformOrigin: '0 0', duration: 1.1, ease: 'expo.inOut',
                    });
                    gsap.to(mark, { color: '#ece8df', duration: 0.5, delay: 0.25 });
                    gsap.to(loader, { backgroundColor: 'rgba(236, 232, 223, 0)', duration: 0.9, ease: 'power2.inOut', delay: 0.1 });
                    gsap.delayedCall(1.1, () => { loader.remove(); HTML.classList.remove('is-first'); });
                    if (hero) { hero.paused = false; hero.kick(); }
                    resolve();
                }, '+=0.05');
        }
    });
}

// ─── Page wash ───────────────────────────────────────────────────────────
// A soft-edged panel sweeps left to right: it covers the page before going
// to another page, and uncovers the new one when it arrives.
function revealWash() {
    const panel = document.querySelector('.wash__panel');
    if (!panel) return;
    // x: 0 so GSAP doesn't add the CSS starting offset on top of xPercent.
    gsap.fromTo(panel, { x: 0, xPercent: -15 }, {
        xPercent: 50, duration: 1.1, ease: 'power3.inOut',
        onComplete: () => HTML.classList.remove('is-return'),
    });
}

function pageLinks() {
    document.addEventListener('click', e => {
        const a = e.target.closest('a[href]');
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (a.target === '_blank' || a.hasAttribute('download')) return;
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin || url.pathname === location.pathname) return;
        const panel = document.querySelector('.wash__panel');
        if (!panel || REDUCED) return;
        e.preventDefault();
        gsap.fromTo(panel, { x: 0, xPercent: -100 }, {
            xPercent: -15, duration: 0.75, ease: 'power3.inOut',
            onComplete: () => { location.href = url.href; },
        });
    });
    // Coming back through the history cache: don't leave the page covered.
    window.addEventListener('pageshow', e => { if (e.persisted) gsap.set('.wash__panel', { xPercent: 50 }); });
}

function revealHeroText(delay) {
    gsap.to('.hero__title .line > span', { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1, delay });
    gsap.to('.hero__stack figure', { y: 0, opacity: 1, duration: 1.6, ease: 'expo.out', stagger: 0.12, delay: delay + 0.15 });
    document.querySelectorAll('.hero .reveal').forEach((el, i) => setTimeout(() => el.classList.add('is-revealed'), 500 + i * 120));
}

// Hero melts back into plain waves as it scrolls away.
function heroScroll() {
    const hero = heroWaves();
    const section = document.querySelector('.hero');
    if (!hero || !section) return;
    ScrollTrigger.create({
        trigger: section, start: 'top top', end: 'bottom top',
        onUpdate: self => {
            if (document.body.classList.contains('is-intro')) return;
            hero.form = 1 - self.progress * 0.9;
            if (REDUCED) hero.redraw();
        },
    });
    gsap.to('.hero__foot', { yPercent: -40, opacity: 0, ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true } });
}

// The product shot leans towards the pointer.
function stackTilt() {
    const el = document.querySelector('.stack__tilt');
    if (!el || !FINE || REDUCED) return;
    const ry = gsap.quickTo(el, 'rotationY', { duration: 1.2, ease: 'power3.out' });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 1.2, ease: 'power3.out' });
    window.addEventListener('pointermove', e => {
        ry(-14 + (e.clientX / innerWidth - 0.5) * 10);
        rx(7 - (e.clientY / innerHeight - 0.5) * 8);
    }, { passive: true });
}

// ─── Nav ─────────────────────────────────────────────────────────────────
function nav() {
    const clock = document.querySelector('[data-clock]');
    if (clock) {
        const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' });
        const tick = () => { clock.textContent = fmt.format(new Date()); };
        tick(); setInterval(tick, 15000);
    }
    document.querySelectorAll('[data-year]').forEach(y => { y.textContent = new Date().getFullYear(); });
}

// ─── Reveal on scroll ────────────────────────────────────────────────────
function reveals() {
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            e.target.classList.add('is-revealed');
            io.unobserve(e.target);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.reveal').forEach(el => { if (!el.closest('.hero')) io.observe(el); });
}

// Words light up one by one as the paragraph scrolls through.
function wordScrub() {
    document.querySelectorAll('[data-words]').forEach(p => {
        const words = p.textContent.trim().split(/\s+/);
        p.innerHTML = words.map(w => `<span class="w">${w}</span>`).join(' ');
        const spans = p.querySelectorAll('.w');
        if (REDUCED) return;
        ScrollTrigger.create({
            trigger: p, start: 'top 80%', end: 'bottom 50%',
            onUpdate: self => {
                const lit = Math.round(self.progress * spans.length);
                spans.forEach((s, i) => { s.style.opacity = i < lit ? 1 : ''; });
            },
        });
    });
}

// ─── Cursor + hover previews ─────────────────────────────────────────────
// A solid dot that sits exactly on the pointer, and an outline ring that
// trails it and stretches into an oval along the direction of travel.
function cursor() {
    const el = document.querySelector('.cursor');
    if (!el || !FINE) return;
    const dot = el.querySelector('.cursor__dot');
    const ring = el.querySelector('.cursor__ring');
    const label = el.querySelector('.cursor__label');
    HTML.classList.add('has-cursor');
    const pos = { x: innerWidth / 2, y: innerHeight / 2 }, cur = { ...pos };
    let stretch = 0, angle = 0;
    window.addEventListener('pointermove', e => { pos.x = e.clientX; pos.y = e.clientY; el.classList.add('is-on'); }, { passive: true });
    document.addEventListener('pointerleave', () => el.classList.remove('is-on'));
    gsap.ticker.add(() => {
        const vx = (pos.x - cur.x) * 0.16, vy = (pos.y - cur.y) * 0.16;
        cur.x += vx; cur.y += vy;
        const speed = Math.hypot(vx, vy);
        if (speed > 0.4) angle = Math.atan2(vy, vx);
        stretch += (Math.min(speed / 26, 0.65) - stretch) * 0.2;
        dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        ring.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0) rotate(${angle}rad) scale(${1 + stretch}, ${1 - stretch * 0.45})`;
        // Keep the label upright and unstretched inside the ring.
        label.style.transform = `scale(${1 / (1 + stretch)}, ${1 / (1 - stretch * 0.45)}) rotate(${-angle}rad)`;
    });
    document.addEventListener('pointerover', e => {
        const t = e.target.closest('a, button, summary, [data-cursor]');
        el.classList.toggle('is-link', !!t);
        const text = t?.dataset.cursor;
        el.classList.toggle('is-label', !!text);
        if (text) label.textContent = text;
    });
}

// The preview card is attached to the hovered title: it sits just past the
// end of the words, glides between rows, leans as it moves, and follows the
// pointer a little vertically.
function previews() {
    const box = document.querySelector('.preview');
    if (!box || !FINE) return;
    const img = box.querySelector('.preview__img');
    const pointer = { y: 0 };
    const cur = { x: -9999, y: 0 };
    let active = null;
    window.addEventListener('pointermove', e => { pointer.y = e.clientY; }, { passive: true });
    const W = () => box.offsetWidth, H = () => box.offsetHeight;
    gsap.ticker.add(() => {
        if (!active) return;
        const name = active.querySelector('[data-title]') || active;
        const r = name.getBoundingClientRect();
        const row = active.getBoundingClientRect();
        const tx = Math.min(innerWidth - W() - 16, r.right + 36);
        const ty = gsap.utils.clamp(12, innerHeight - H() - 12,
            row.top + row.height / 2 - H() / 2 + (pointer.y - (row.top + row.height / 2)) * 0.25);
        if (cur.x < -9000) { cur.x = tx; cur.y = ty; }
        const dy = ty - cur.y;
        cur.x += (tx - cur.x) * 0.14; cur.y += dy * 0.14;
        box.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0) rotate(${gsap.utils.clamp(-5, 5, dy * 0.06)}deg)`;
    });
    const items = [...document.querySelectorAll('[data-img]')].map(el => [el, el.dataset.img]);
    // Fetch the (small) preview images ahead of the first hover.
    const warm = () => items.forEach(([, src]) => { new Image().src = src; });
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 3000);
    items.forEach(([el, src]) => {
        el.addEventListener('pointerenter', () => {
            if (!active) cur.x = -9999;
            active = el;
            img.style.backgroundImage = `url("${src}")`;
            gsap.fromTo(img, { scale: 1.15, opacity: 0.4 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'expo.out' });
            box.classList.add('is-on');
        });
        el.addEventListener('pointerleave', () => {
            if (active === el) { active = null; box.classList.remove('is-on'); }
        });
    });
}

// ─── Curtain footer ──────────────────────────────────────────────────────
// The footer sits fixed under the page, which slides up to uncover it.
function curtain() {
    const footer = document.querySelector('.footer');
    const main = document.querySelector('.main');
    if (!footer || !main) return;
    const fw = waves.get(footer.querySelector('canvas'));
    const set = () => {
        document.body.classList.remove('has-curtain');
        main.style.marginBottom = '';
        const fh = footer.offsetHeight;
        if (innerWidth > 760 && fh <= innerHeight + 2) {
            document.body.classList.add('has-curtain');
            main.style.marginBottom = fh + 'px';
        }
        ScrollTrigger.refresh();
    };
    set();
    window.addEventListener('resize', () => requestAnimationFrame(set));
    if (fw) {
        // A fixed canvas always counts as "on screen", so pause it by hand
        // until the page has scrolled far enough to show it.
        const check = () => {
            const shown = !document.body.classList.contains('has-curtain') ||
                window.scrollY + innerHeight > main.offsetHeight - 40;
            if (shown && fw.paused) { fw.paused = false; fw.kick(); } else if (!shown) fw.paused = true;
        };
        check();
        if (lenis) lenis.on('scroll', check); else window.addEventListener('scroll', check, { passive: true });
    }
}

// ─── 3D house (loads three.js and the model only when nearby) ────────────
function lazy3D() {
    const canvas = document.getElementById('three-canvas');
    if (!canvas) return;
    const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.min.js';
        s.onload = () => init3D(canvas);
        document.head.appendChild(s);
    }, { rootMargin: '600px 0px' });
    io.observe(canvas);
}

function init3D(canvas) {
    const W = canvas.offsetWidth || 800, H = canvas.offsetHeight || 480;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const grid = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.PlaneGeometry(24, 24, 24, 24)),
        new THREE.LineBasicMaterial({ color: 0x1c1c1f })
    );
    grid.rotation.x = -Math.PI / 2;
    scene.add(grid);

    const house = new THREE.Group();
    scene.add(house);
    const redMat = new THREE.LineBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: 0.6 });
    const boneMat = new THREE.LineBasicMaterial({ color: 0xece8df, transparent: true, opacity: 0.28 });
    const lookTarget = new THREE.Vector3(0, 0.7, 0);

    // house.bin: Uint32 [vertices, interior idx, structure idx], Float32 bbox
    // min/max, Uint16 quantised positions, then Uint16 edge index pairs.
    fetch(ROOT + '/assets/models/house.bin').then(r => r.arrayBuffer()).then(buf => {
        const [n, nRed, nBone] = new Uint32Array(buf, 0, 3);
        const box = new Float32Array(buf, 12, 6);
        const q = new Uint16Array(buf, 36, n * 3);
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < pos.length; i++) {
            const k = i % 3;
            pos[i] = box[k] + (q[i] / 65535) * (box[k + 3] - box[k]);
        }
        const posAttr = new THREE.BufferAttribute(pos, 3);
        let off = 36 + n * 6;
        const redIdx = new Uint16Array(buf, off, nRed); off += nRed * 2;
        const boneIdx = new Uint16Array(buf, off, nBone);

        const size = new THREE.Vector3(box[3] - box[0], box[4] - box[1], box[5] - box[2]);
        const center = new THREE.Vector3((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2);
        const scale = 6 / Math.max(size.x, size.y, size.z);

        const pivot = new THREE.Group();
        pivot.position.set(-center.x, -center.y, -center.z);
        house.add(pivot);
        [[redIdx, redMat], [boneIdx, boneMat]].forEach(([idx, mat]) => {
            if (!idx.length) return;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', posAttr);
            geo.setIndex(new THREE.BufferAttribute(idx, 1));
            pivot.add(new THREE.LineSegments(geo, mat));
        });
        house.scale.setScalar(scale);
        house.position.set(0, (center.y - box[1]) * scale, 0);

        const hbox = new THREE.Box3().setFromObject(house);
        const hcen = hbox.getCenter(new THREE.Vector3());
        const hsize = hbox.getSize(new THREE.Vector3());
        camera.position.set(hcen.x, hcen.y + hsize.y * 0.3, hcen.z + Math.max(hsize.x, hsize.z) * 1.8);
        lookTarget.copy(hcen);
    }).catch(err => console.error('Model failed to load:', err));

    let tx = 0, ty = 0, visible = true;
    window.addEventListener('pointermove', e => {
        tx = (e.clientX / innerWidth - 0.5) * 2;
        ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

    camera.position.set(0, 2.5, 9);
    camera.lookAt(lookTarget);
    gsap.ticker.add(() => {
        if (!visible) return;
        if (!REDUCED) house.rotation.y += 0.004;
        camera.position.x += (tx * 1.6 - camera.position.x) * 0.035;
        camera.position.y += (-ty * 0.9 + 2.5 - camera.position.y) * 0.035;
        camera.lookAt(lookTarget);
        renderer.render(scene, camera);
    });
    window.addEventListener('resize', () => {
        const w = canvas.offsetWidth, h = canvas.offsetHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
    });
}

// ─── Plugin page: screenshots swap as each step scrolls past ─────────────
function stepStory() {
    const shots = document.querySelectorAll('[data-shot]');
    const steps = document.querySelectorAll('[data-step]');
    if (!shots.length || !steps.length) return;
    steps.forEach(step => {
        ScrollTrigger.create({
            trigger: step, start: 'top 60%', end: 'bottom 60%',
            onToggle: self => {
                if (!self.isActive) return;
                steps.forEach(s => s.classList.toggle('is-active', s === step));
                shots.forEach(s => s.classList.toggle('is-active', s.dataset.shot === step.dataset.step));
            },
        });
    });
}

// ─── Selected work ──────────────────────────────────────────────────────
// The browser on the right shows a full-page screenshot of the active project
// scrolling slowly. Clicking it ("Feel it") loads the real site in its place;
// once loaded you can scroll and click it. Leaving the box hands the wheel
// back to the page (the site stays); switching project or leaving the section
// goes back to the screenshot.
function showreel() {
    const items = [...document.querySelectorAll('[data-reel]')];
    if (!items.length) return;

    // Phones: each project's screenshot scrolls inline while it's in view.
    document.querySelectorAll('.showreel__inline').forEach(el => {
        new IntersectionObserver(([e]) => el.classList.toggle('is-playing', e.isIntersecting), { threshold: 0.3 }).observe(el);
    });

    const stage = document.querySelector('.showreel__stage');
    if (!stage || !window.matchMedia('(min-width: 901px)').matches) return;
    const view = stage.querySelector('.browser__view');
    const shots = [...stage.querySelectorAll('[data-reel-shot]')];
    const url = stage.querySelector('[data-reel-url]');
    const liveBtn = stage.querySelector('[data-reel-live]');
    const frameBox = stage.querySelector('[data-reel-frame]');
    const cursorEl = document.querySelector('.cursor');
    const cursorLabel = document.querySelector('.cursor__label');
    let activeItem = items[0];

    const load = shot => { const img = shot?.querySelector('img'); if (img && !img.src) img.src = img.dataset.src; };
    const showShot = key => shots.forEach((s, i) => {
        const on = s.dataset.reelShot === key;
        if (on) { load(s); load(shots[i + 1]); }  // and warm up the next one
        s.classList.toggle('is-active', on);
    });

    const fitFrame = () => {
        const f = frameBox.firstElementChild;
        if (!f) return;
        const sc = frameBox.clientWidth / 1280;
        f.style.height = `${frameBox.clientHeight / sc}px`;
        f.style.transform = `scale(${sc})`;
    };
    new ResizeObserver(fitFrame).observe(frameBox);

    const setCursorText = text => {
        view.dataset.cursor = text;
        if (view.matches(':hover') && cursorLabel) cursorLabel.textContent = text;
    };
    // Inside the site the page never hears about the pointer, so the custom
    // cursor would freeze there: it steps aside while the site has control.
    const setInteractive = on => {
        stage.classList.toggle('is-interactive', on);
        cursorEl?.classList.toggle('is-hidden', on);
        liveBtn.querySelector('span').textContent = on ? 'Done' : 'Feel it';
    };
    const unloadLive = () => {
        frameBox.replaceChildren();
        stage.classList.remove('is-live', 'is-loading');
        setInteractive(false);
        setCursorText('Feel it');
    };
    const goLive = () => {
        if (stage.classList.contains('is-live')) { setInteractive(true); return; }
        if (stage.classList.contains('is-loading')) return;
        const item = activeItem;
        stage.classList.add('is-loading');
        setCursorText('Loading');
        const f = document.createElement('iframe');
        f.src = item.querySelector('a').href;
        f.title = `${item.querySelector('.showreel__name').textContent}, live`;
        f.addEventListener('load', () => {
            if (item !== activeItem) return;
            stage.classList.remove('is-loading');
            stage.classList.add('is-live');
            setCursorText('Feel it');
            if (view.matches(':hover')) setInteractive(true);
        }, { once: true });
        frameBox.replaceChildren(f);
        fitFrame();
    };
    view.addEventListener('click', goLive);
    stage.addEventListener('mouseleave', () => setInteractive(false));
    liveBtn.addEventListener('click', () => (stage.classList.contains('is-interactive') ? setInteractive(false) : goLive()));

    const activate = item => {
        if (item !== activeItem) unloadLive();
        activeItem = item;
        items.forEach(i => i.classList.toggle('is-active', i === item));
        showShot(item.dataset.reel);
        if (url) url.textContent = item.dataset.reelHost;
    };
    items.forEach(item => ScrollTrigger.create({
        trigger: item, start: 'top 60%', end: 'bottom 60%',
        onToggle: self => { if (self.isActive) activate(item); },
    }));
    ScrollTrigger.create({
        trigger: '.showreel', start: 'top bottom', end: 'bottom top',
        onToggle: self => { if (!self.isActive) unloadLive(); },
    });
}

// ─── Go ──────────────────────────────────────────────────────────────────
nav();
wordScrub();
reveals();
cursor();
previews();
curtain();
heroScroll();
lazy3D();
stepStory();
stackTilt();
pageLinks();
showreel();
if (document.fonts?.ready) document.fonts.ready.then(intro); else intro();
