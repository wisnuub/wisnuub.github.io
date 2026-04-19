// ─── Shared preview thumbnail helper ─────────────────────────────────────
const LOCAL_THUMBS = {
    'https://protocoffee.com.au/': './assets/images/proto-coffee.webp',
};
function previewThumb(url) {
    return LOCAL_THUMBS[url] ||
        `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
}

window.addEventListener('load', () => {
    gsap.registerPlugin(ScrollTrigger);
    initTearEffect(); // preload texture during loader so hero is ready instantly
    initLoader();
});

// ─── Loader: W-A(logo)-K curtain reveal ──────────────────────────────────
function initLoader() {
    const loader = document.getElementById('loader');
    const bar    = document.querySelector('.loader-bar');
    const numEl  = document.querySelector('.loader-num');

    // Kick off prefetch of all work preview images immediately
    const workLinks = Array.from(document.querySelectorAll('.work-item[href]'));
    let loaded = 0;
    const total = workLinks.length;
    workLinks.forEach(el => {
        const img = new Image();
        img.onload = img.onerror = () => loaded++;
        img.src = previewThumb(el.getAttribute('href'));
    });

    // Phase 1: letter reveal (fixed ~1s)
    gsap.set('.loader-bottom', { opacity: 0 });
    if (bar) bar.style.width = '0%';

    const letterTl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    letterTl
        .to(['.ll-w', '.ll-logo', '.ll-k'], { y: '0%', duration: 1.2, stagger: 0.1 }, 0)
        .to('.loader-bottom', { opacity: 1, duration: 0.4 }, 0.6);

    // Phase 2: progress bar driven by actual image loading
    const MIN_MS = 2500;
    const MAX_MS = 6000;
    const start  = Date.now();
    let   display = 0;
    let   exiting = false;

    function tick() {
        const elapsed  = Date.now() - start;
        const real     = total > 0 ? loaded / total : 1;
        const timeFrac = Math.min(elapsed / MAX_MS, 1);
        // Time nudges bar up to 90% max; real progress can push past that
        const target   = Math.min(Math.max(real, timeFrac * 0.9) * 100, 100);

        display += (target - display) * 0.06;
        const pct = Math.min(Math.round(display), 100);

        if (bar)   bar.style.width   = pct + '%';
        if (numEl) numEl.textContent = pct;

        const done    = real >= 1 || elapsed >= MAX_MS;
        const minMet  = elapsed >= MIN_MS;

        if (!exiting && done && minMet && pct >= 99) {
            exiting = true;
            exitLoader();
        } else {
            requestAnimationFrame(tick);
        }
    }

    letterTl.then(() => requestAnimationFrame(tick));

    function exitLoader() {
        gsap.timeline({
            onComplete() { document.body.classList.remove('is-loading'); initSite(); }
        })
        .to({}, { duration: 0.2 })
        .to(['.ll-w', '.ll-logo', '.ll-k'], {
            y: '110%', duration: 0.7, ease: 'power3.in',
            stagger: { amount: 0.12, from: 'center' }
        })
        .to(loader, { yPercent: -100, duration: 1.1, ease: 'expo.inOut' }, '-=0.35')
        .set(loader, { display: 'none' });
    }
}

// ─── DevTools Guard ───────────────────────────────────────────────────────
(function() {
    let devOpen = false;

    // Method 1: window size — catches docked DevTools (left/right/bottom)
    function sizeCheck() {
        return window.outerWidth  - window.innerWidth  > 160 ||
               window.outerHeight - window.innerHeight > 160;
    }

    // Method 2: element getter — fires when console actively evaluates objects
    let getterHit = false;
    const probe = document.createElement('div');
    Object.defineProperty(probe, 'id', { get() { getterHit = true; return 'x'; } });

    function toggle(open) {
        if (open === devOpen) return;
        devOpen = open;
        document.body.classList.toggle('dt-open', open);
    }

    setInterval(() => {
        getterHit = false;
        console.log(probe);
        toggle(sizeCheck() || getterHit);
    }, 800);
})();

// ─── Site Init ────────────────────────────────────────────────────────────
function initSite() {
    initCursor();
    initNav();
    initHero();
    initMarquee();
    initAboutScrub();
    initScrollAnimations();
    initServicesMenu();
    init3D();
    initWorkPreview();
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// ─── Custom Cursor ────────────────────────────────────────────────────────
function initCursor() {
    const dot  = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    if (!dot || !ring || !window.matchMedia('(pointer: fine)').matches) return;

    let mX = window.innerWidth / 2, mY = window.innerHeight / 2;
    let rX = mX, rY = mY;

    dot.style.opacity = ring.style.opacity = '1';

    document.addEventListener('mousemove', e => {
        mX = e.clientX; mY = e.clientY;
        dot.style.left = mX + 'px';
        dot.style.top  = mY + 'px';
    });

    (function loop() {
        rX += (mX - rX) * 0.11;
        rY += (mY - rY) * 0.11;
        ring.style.left = rX + 'px';
        ring.style.top  = rY + 'px';
        requestAnimationFrame(loop);
    })();

    document.querySelectorAll('a, button').forEach(el => {
        el.addEventListener('mouseenter', () => ring.classList.add('hovered'));
        el.addEventListener('mouseleave', () => ring.classList.remove('hovered'));
    });

    document.addEventListener('mouseleave', () => { dot.style.opacity = ring.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { dot.style.opacity = ring.style.opacity = '1'; });
}

// ─── Nav ──────────────────────────────────────────────────────────────────
function initNav() {
    const nav = document.getElementById('nav');
    ScrollTrigger.create({
        start: 80,
        onToggle: self => nav.classList.toggle('scrolled', self.isActive)
    });
}

// ─── Marquee — seamless loop, velocity-linked ────────────────────────────
function initMarquee() {
    const strips = document.querySelectorAll('.marquee-strip');
    if (!strips.length) return;

    const tweens = [];

    strips.forEach(strip => {
        const track = strip.querySelector('.marquee-track');
        if (!track) return;
        const reversed = strip.classList.contains('reverse');

        // Snapshot original items, then clone until 3× viewport wide
        const originals = Array.from(track.children);
        const oneSetW = track.scrollWidth;

        while (track.scrollWidth < window.innerWidth * 3) {
            originals.forEach(child => track.appendChild(child.cloneNode(true)));
        }

        // Start reversed track at -oneSetW so forward and reverse feel mirror
        if (reversed) gsap.set(track, { x: -oneSetW });

        // Animate exactly one set width — seamless reset is invisible
        const tween = gsap.to(track, {
            x: reversed ? 0 : -oneSetW,
            duration: 24,
            ease: 'none',
            repeat: -1,
        });

        tweens.push(tween);
    });

    // Speed up on scroll velocity
    ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate(self) {
            const v = Math.min(Math.abs(self.getVelocity()) / 150, 5);
            tweens.forEach(t => t.timeScale(1 + v));
        }
    });
}

// ─── Hero Text Entrance ───────────────────────────────────────────────────
function initHero() {
    gsap.to(['.hero-quote p', '.hero-scroll'], { opacity: 1, y: 0, duration: 1.2, delay: 0.4, ease: 'power3.out', stagger: 0.15 });
}

// ─── Hero: glitch face effect + mouse parallax ──────────────────
function initTearEffect() {
    const canvas = document.getElementById('tear-canvas');
    if (!canvas || !window.THREE) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geo = new THREE.PlaneGeometry(2, 2);

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform sampler2D uTex;
        uniform float uTime;
        uniform vec2 uMouse;
        uniform vec2 uCoverScale;
        uniform vec2 uCoverOffset;
        uniform vec2 uFaceCenter;
        uniform vec2 uFaceSize;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                f.y
            );
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
            return v;
        }

        void main() {
            vec2 uv = vUv;

            // Mouse parallax
            vec2 mouse = (uMouse - 0.5) * vec2(-0.04, 0.02);
            vec2 baseUv = uv * uCoverScale + uCoverOffset + mouse;

            // Face ellipse mask
            vec2 faceCoord  = (uv - uFaceCenter) / uFaceSize;
            float faceDist  = length(faceCoord);
            float faceMask  = 1.0 - smoothstep(0.60, 1.20, faceDist);

            // Fixed medium speed clocks
            float gT = floor(uTime * 9.0);
            float sT = floor(uTime * 5.0);

            // ── 1. Large block glitch — random horizontal strips shift ─
            float bSize  = 0.035;
            float bY     = floor(uv.y / bSize) * bSize;
            float bRnd   = hash(vec2(bY * 7.3, gT));
            float bAct   = step(0.78, bRnd);
            float bShift = (hash(vec2(bY + 0.17, sT)) * 2.0 - 1.0) * 0.09;
            float blockX = bShift * bAct * faceMask;

            // ── 2. Fine scan-line glitch — thin lines skip sideways ───
            float sY     = floor(uv.y * 180.0);
            float sRnd   = hash(vec2(sY * 3.1, gT * 2.0));
            float sAct   = step(0.88, sRnd);
            float sShift = (hash(vec2(sY + 0.5, sT * 1.5)) * 2.0 - 1.0) * 0.03;
            float scanX  = sShift * sAct * faceMask;

            vec2 glitchUv = baseUv + vec2(blockX + scanX, 0.0);

            // ── 3. Chromatic aberration — RGB split, stronger on face ─
            float ab = 0.004 + faceMask * 0.020;
            float r  = texture2D(uTex, clamp(glitchUv + vec2( ab, 0.0), 0.0, 1.0)).r;
            float g  = texture2D(uTex, clamp(glitchUv,                   0.0, 1.0)).g;
            float b  = texture2D(uTex, clamp(glitchUv - vec2( ab, 0.0), 0.0, 1.0)).b;
            vec4 col = vec4(r, g, b, 1.0);

            // ── 4. Desaturate + dark + cool tint ─────────────────────
            float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(col.rgb, vec3(luma), 0.72);
            col.rgb *= 0.48;
            col.rgb *= mix(vec3(1.0), vec3(0.80, 0.95, 1.08), faceMask);

            // ── 5. Scan line overlay (CRT feel) ───────────────────────
            float scanLine = step(0.5, fract(uv.y * 320.0));
            col.rgb *= 0.90 + scanLine * 0.10;

            // ── 6. Glitch highlight — cyan or red flash on displaced strips
            float gIntensity = clamp((abs(blockX) + abs(scanX)) * 12.0, 0.0, 1.0);
            // Alternate between cyan and red based on block random value
            float isRed    = step(0.5, bRnd);
            vec3 cyanFlash = col.rgb * vec3(0.5, 1.4, 1.3);
            vec3 redFlash  = col.rgb * vec3(2.8, 0.4, 0.4);
            vec3 glitchCol = mix(cyanFlash, redFlash, isRed);
            col.rgb = mix(col.rgb, glitchCol, gIntensity * 0.80);

            // Extra: red chromatic ghost offset on R channel
            float rGhost = texture2D(uTex, clamp(glitchUv + vec2(0.025, 0.0), 0.0, 1.0)).r;
            col.r = mix(col.r, rGhost * 1.8, gIntensity * isRed * 0.6);

            // ── 7. Digital noise grain ────────────────────────────────
            float grain = hash(floor(uv * vec2(380.0, 280.0) + gT * 2.5));
            col.rgb += (grain - 0.5) * 0.06 * faceMask;

            // ── 8. Vignette ───────────────────────────────────────────
            vec2 vig = uv * 2.0 - 1.0;
            col.rgb *= 1.0 - dot(vig * vec2(0.4, 0.5), vig * vec2(0.4, 0.5)) * 0.6;

            gl_FragColor = col;
        }
    `;

    const uniforms = {
        uTex:         { value: null },
        uTime:        { value: 0.0 },
        uMouse:       { value: new THREE.Vector2(0.5, 0.5) },
        uCoverScale:  { value: new THREE.Vector2(1.0, 1.0) },
        uCoverOffset: { value: new THREE.Vector2(0.0, 0.0) },
        uFaceCenter:  { value: new THREE.Vector2(0.5, 0.63) },
        uFaceSize:    { value: new THREE.Vector2(0.24, 0.30) },
    };

    function updateFaceMask() {
        const mobile = window.innerWidth < 768;
        uniforms.uFaceCenter.value.set(0.5, mobile ? 0.56 : 0.58);
        uniforms.uFaceSize.value.set(mobile ? 0.32 : 0.20, mobile ? 0.28 : 0.30);
    }
    updateFaceMask();

    const mat  = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    function updateCoverUVs(imgW, imgH) {
        const W = canvas.clientWidth  || window.innerWidth;
        const H = canvas.clientHeight || window.innerHeight;
        const ia = imgW / imgH, ca = W / H;
        let sx = 1, sy = 1, ox = 0, oy = 0;
        if (ca > ia) { sy = ia / ca; oy = (1 - sy) / 2; }
        else         { sx = ca / ia; ox = (1 - sx) / 2; }
        uniforms.uCoverScale.value.set(sx, sy);
        uniforms.uCoverOffset.value.set(ox, oy);
    }

    const loader = new THREE.TextureLoader();
    loader.load('./assets/images/hero.webp', tex => {
        tex.minFilter = THREE.LinearFilter;
        uniforms.uTex.value = tex;
        const img = tex.image;
        updateCoverUVs(img.naturalWidth || img.width, img.naturalHeight || img.height);
    });

    function resize() {
        const W = canvas.clientWidth  || window.innerWidth;
        const H = canvas.clientHeight || window.innerHeight;
        renderer.setSize(W, H, false);
        if (uniforms.uTex.value?.image) {
            const img = uniforms.uTex.value.image;
            updateCoverUVs(img.naturalWidth || img.width, img.naturalHeight || img.height);
        }
    }
    resize();
    window.addEventListener('resize', () => { resize(); updateFaceMask(); });

    document.addEventListener('mousemove', e => {
        uniforms.uMouse.value.set(
            e.clientX / window.innerWidth,
            1.0 - e.clientY / window.innerHeight
        );
    });

    const clock = new THREE.Clock();
    (function draw() {
        requestAnimationFrame(draw);
        uniforms.uTime.value = clock.getElapsedTime();
        renderer.render(scene, camera);
    })();
}

// ─── About section — editorial heading scrub + reveal animations ─────────
function initAboutScrub() {
    // Heading lines reveal one-by-one tied to scroll position
    const lineTl = gsap.timeline({
        scrollTrigger: {
            trigger: '.about-heading-wrap',
            start: 'top 78%',
            end:   'top 5%',
            scrub: 1.4,
        }
    });
    gsap.utils.toArray('.ah-line').forEach((line, i) => {
        lineTl.fromTo(line,
            { yPercent: 90, opacity: 0 },
            { yPercent: 0, opacity: 1, duration: 1, ease: 'power2.out' },
            i * 0.55
        );
    });

    // Horizontal rules draw left → right on enter
    gsap.utils.toArray('.about-rule').forEach((rule, i) => {
        gsap.fromTo(rule,
            { scaleX: 0, transformOrigin: 'left' },
            {
                scaleX: 1,
                scrollTrigger: { trigger: rule, start: 'top 92%' },
                duration: 1.4, delay: i * 0.05, ease: 'expo.out'
            }
        );
    });

    // Photo clip-path reveal — bottom up
    gsap.fromTo('.photo-frame img',
        { clipPath: 'inset(100% 0 0 0)' },
        {
            clipPath: 'inset(0% 0 0 0)',
            scrollTrigger: { trigger: '.photo-frame', start: 'top 82%' },
            duration: 1.6, ease: 'expo.out'
        }
    );

    // Photo parallax
    gsap.to('.photo-frame', {
        scrollTrigger: {
            trigger: '#about',
            start: 'top bottom',
            end:   'bottom top',
            scrub: 1.5,
        },
        y: -60, ease: 'none'
    });

    // Text col paragraphs stagger
    gsap.utils.toArray('.about-text-col p').forEach((el, i) => {
        gsap.from(el, {
            scrollTrigger: { trigger: el, start: 'top 92%' },
            opacity: 0, y: 28, duration: 1, delay: i * 0.12, ease: 'power3.out'
        });
    });

    gsap.from('.about-meta', {
        scrollTrigger: { trigger: '.about-meta', start: 'top 92%' },
        opacity: 0, y: 16, duration: 0.9, ease: 'power2.out'
    });

    // Stats strip: each item slides up
    gsap.utils.toArray('.ass-item').forEach((item, i) => {
        gsap.fromTo(item,
            { opacity: 0, y: 50 },
            {
                opacity: 1, y: 0,
                scrollTrigger: { trigger: '.about-stats-strip', start: 'top 85%' },
                duration: 1, delay: i * 0.18, ease: 'power3.out'
            }
        );
    });
}

// ─── Scroll Animations ────────────────────────────────────────────────────
function initScrollAnimations() {

    // Section titles — clip-path wipe up from bottom
    gsap.utils.toArray('.section-title').forEach(el => {
        gsap.fromTo(el,
            { clipPath: 'inset(0 0 100% 0)', opacity: 0 },
            {
                clipPath: 'inset(0 0 0% 0)', opacity: 1,
                scrollTrigger: { trigger: el, start: 'top 88%' },
                duration: 1.2, ease: 'expo.out'
            }
        );
    });

    // Stats counter (about section)
    document.querySelectorAll('.count').forEach(el => {
        const target = parseInt(el.dataset.target, 10);
        ScrollTrigger.create({
            trigger: el, start: 'top 85%', once: true,
            onEnter() {
                const obj = { val: 0 };
                gsap.to(obj, {
                    val: target, duration: 2.2, ease: 'power2.out',
                    onUpdate() { el.textContent = Math.ceil(obj.val); }
                });
            }
        });
    });

    // Services: border draws first, then text slides in
    const svcs = gsap.utils.toArray('.svc-item');
    svcs.forEach((el, i) => {
        gsap.fromTo(el,
            { clipPath: 'inset(0 100% 0 0)' },
            {
                clipPath: 'inset(0 0% 0 0)',
                scrollTrigger: { trigger: el, start: 'top 92%' },
                duration: 0.9, delay: i * 0.06, ease: 'expo.out'
            }
        );
    });

    gsap.from('.svc-explore', {
        scrollTrigger: { trigger: '.svc-explore', start: 'top 92%' },
        opacity: 0, y: 16, duration: 0.8, ease: 'power2.out'
    });

    // 3D canvas fade + scale
    gsap.fromTo('.canvas-3d-wrap',
        { opacity: 0, scale: 0.97 },
        {
            opacity: 1, scale: 1,
            scrollTrigger: { trigger: '.canvas-3d-wrap', start: 'top 85%' },
            duration: 1.2, ease: 'power3.out'
        }
    );

    // Section title for showcase: parallax push-up while canvas fills
    gsap.to('.showcase-header .section-title', {
        scrollTrigger: {
            trigger: '#showcase',
            start: 'top bottom',
            end:   'center center',
            scrub: 1.2,
        },
        y: -40, ease: 'none'
    });

    // Work items: clip-path reveals bottom-up
    gsap.utils.toArray('.work-item').forEach((el, i) => {
        gsap.fromTo(el,
            { clipPath: 'inset(0 0 100% 0)', opacity: 0 },
            {
                clipPath: 'inset(0 0 0% 0)', opacity: 1,
                scrollTrigger: { trigger: el, start: 'top 96%' },
                duration: 0.75, delay: i * 0.04, ease: 'expo.out'
            }
        );
    });
}

// ─── Services — hover-reveal ──────────────────────────────────────
function initServicesMenu() {
    const reveal  = document.getElementById('svc-reveal');
    const revImg  = document.getElementById('svc-reveal-img');
    if (!reveal || !revImg) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let mouseX = 0, mouseY = 0;
    let rvX = 0,  rvY = 0;
    let active = false;
    let lastX  = 0;

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    (function loop() {
        rvX += (mouseX - rvX) * 0.09;
        rvY += (mouseY - rvY) * 0.09;

        if (active) {
            // Slight rotation based on horizontal velocity
            const vx  = mouseX - lastX;
            const rot = Math.max(-6, Math.min(6, vx * 0.3));
            lastX = mouseX;

            let x = rvX + 40;
            let y = rvY - 100;
            x = Math.max(8, Math.min(window.innerWidth  - 316, x));
            y = Math.max(8, Math.min(window.innerHeight - 216, y));

            reveal.style.left      = x + 'px';
            reveal.style.top       = y + 'px';
            reveal.style.transform = `rotate(${rot}deg)`;
        }

        requestAnimationFrame(loop);
    })();

    document.querySelectorAll('.svc-item').forEach(item => {
        const img = item.dataset.img;

        item.addEventListener('mouseenter', () => {
            revImg.style.backgroundImage = `url('${img}')`;
            reveal.classList.add('active');
            active = true;
        });

        item.addEventListener('mouseleave', () => {
            reveal.classList.remove('active');
            active = false;
        });
    });
}

// ─── Work item: cursor-following screenshot preview ───────────────────────
function initWorkPreview() {
    const preview    = document.getElementById('work-preview');
    const previewImg = document.getElementById('work-preview-img');
    if (!preview || !previewImg) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const W = preview.offsetWidth  || 320;
    const H = preview.offsetHeight || 210;

    let curX = window.innerWidth  / 2;
    let curY = window.innerHeight / 2;
    let pvX  = curX;
    let pvY  = curY;

    document.addEventListener('mousemove', e => {
        curX = e.clientX;
        curY = e.clientY;
    });

    // Slower lerp than ring cursor (0.05 vs 0.11) — trails behind like a train
    (function loop() {
        requestAnimationFrame(loop);
        pvX += (curX - pvX) * 0.05;
        pvY += (curY - pvY) * 0.05;

        // Center card on cursor
        let x = pvX - W / 2;
        let y = pvY - H / 2;

        x = Math.max(8, Math.min(window.innerWidth  - W - 8, x));
        y = Math.max(8, Math.min(window.innerHeight - H - 8, y));

        preview.style.left = x + 'px';
        preview.style.top  = y + 'px';
    })();

    document.querySelectorAll('.work-item').forEach(item => {
        const url = item.getAttribute('href');
        item.addEventListener('mouseenter', () => {
            previewImg.src = previewThumb(url);
            preview.classList.add('visible');
        });
        item.addEventListener('mouseleave', () => {
            preview.classList.remove('visible');
        });
    });
}

// ─── Three.js Interactive 3D House ───────────────────────────────────────
function init3D() {
    const canvas = document.getElementById('three-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const W = canvas.offsetWidth  || 800;
    const H = canvas.offsetHeight || 480;

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);
    camera.position.set(0, 2.5, 9);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const redMat   = new THREE.LineBasicMaterial({ color: 0xfd3737, transparent: true, opacity: 0.9 });
    const whiteMat = new THREE.LineBasicMaterial({ color: 0xf0ece4, transparent: true, opacity: 0.3 });
    const dimMat   = new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.9 });
    const gridMat  = new THREE.LineBasicMaterial({ color: 0x181818, transparent: true, opacity: 1 });

    const house = new THREE.Group();
    scene.add(house);

    // Main body
    house.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.BoxGeometry(3.4, 2.4, 2.8)), redMat));

    // Roof
    const roof = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.ConeGeometry(2.6, 1.8, 4)), whiteMat);
    roof.position.y = 2.1;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);

    // Door
    const door = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.BoxGeometry(0.72, 1.15, 0.06)), dimMat);
    door.position.set(0, -0.62, 1.41);
    house.add(door);

    // Windows x2
    [-1.1, 1.1].forEach(x => {
        const win = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.BoxGeometry(0.78, 0.58, 0.06)), dimMat);
        win.position.set(x, 0.28, 1.41);
        house.add(win);
    });

    // Chimney
    const ch = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.BoxGeometry(0.44, 1.1, 0.44)), redMat);
    ch.position.set(1.1, 2.5, 0.3);
    house.add(ch);

    // Ground grid
    const grid = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.PlaneGeometry(18, 18, 18, 18)), gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -1.2;
    scene.add(grid);

    // Particles
    const pPos = new Float32Array(100 * 3);
    for (let i = 0; i < pPos.length; i++) pPos[i] = (Math.random() - 0.5) * 20;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xfd3737, size: 0.045, transparent: true, opacity: 0.5 }));
    scene.add(particles);

    // Mouse parallax
    let tx = 0, ty = 0;
    document.addEventListener('mousemove', e => {
        tx = (e.clientX / window.innerWidth  - 0.5) * 2;
        ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    camera.lookAt(0, 0.7, 0);

    (function animate() {
        requestAnimationFrame(animate);
        house.rotation.y     += 0.005;
        particles.rotation.y += 0.001;
        camera.position.x += (tx * 1.6 - camera.position.x) * 0.035;
        camera.position.y += (-ty * 0.9 + 2.5 - camera.position.y) * 0.035;
        camera.lookAt(0, 0.7, 0);
        renderer.render(scene, camera);
    })();

    window.addEventListener('resize', () => {
        const w = canvas.offsetWidth, h = canvas.offsetHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
}
