// ─── WaveLines ───────────────────────────────────────────────────────────
// Draws a field of horizontal lines that drift like water. When given a
// source (a photo URL or a draw function), the lines bend over its bright
// areas so the picture appears as relief, the way an engraving or a
// topographic map shows shape. Pointer movement sends ripples through them.
//
// Each pixel finds its distance to the nearest line of a scalar field
// f(x, y) = (y + relief + waves + ripple) / gap, so it's one full-screen
// fragment shader with no geometry: cheap at any line count.
//
//   const w = new WaveLines(canvas, { source: './hero.webp' });
//   w.form = 0..1   how strongly the source shows (0 = plain waves)
//   w.reveal = 0..1 left-to-right wipe-in
//
// Falls back to doing nothing when WebGL isn't available; the canvas just
// stays transparent over the page background.
(function () {
    const VERT = `
        attribute vec2 aPos;
        varying vec2 vUv;
        void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
    `;

    const FRAG = `
        #extension GL_OES_standard_derivatives : enable
        precision highp float;
        varying vec2 vUv;
        uniform vec2  uRes;       // canvas size, CSS px
        uniform float uTime;
        uniform float uGap;       // line spacing, CSS px
        uniform float uRelief;    // relief height, in gaps
        uniform float uForm;      // 0..1 how much the source shows
        uniform float uReveal;    // 0..1 wipe-in
        uniform float uHasTex;
        uniform sampler2D uTex;   // r = relief, g = accent amount
        uniform vec2  uScale;     // cover-fit
        uniform vec2  uOffset;
        uniform vec3  uMouse;     // x, y (CSS px, top-left origin), strength
        uniform vec3  uInk;
        uniform vec3  uAccent;
        uniform float uAmp;       // idle wave amplitude, in gaps
        uniform sampler2D uPhoto; // the photo itself, for photo mode
        uniform float uHasPhoto;
        uniform float uGlitch;    // 0..1 glitch over the face (0 = off)
        uniform vec4  uGlitchArea; // face: centre xy, radius zw (source coords)
        uniform vec4  uJaw;       // jaw: centre xy, radius zw (source coords)
        uniform vec4  uNose;      // nasal cavity: top xy, half-width at the bottom, height
        uniform vec4  uMouth;     // teeth: centre xy, half-width, half-height
        uniform vec4  uEyes;      // left eye xy, right eye xy (source coords)
        uniform vec2  uEyeSize;
        uniform sampler2D uGlyphs; // a row of white characters on black
        uniform float uGlyphCount;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        void main() {
            vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);

            vec2 src = vec2(0.0);
            if (uHasTex > 0.5) {
                vec2 t = vec2(vUv.x, 1.0 - vUv.y) * uScale + uOffset;
                // Fade out past the source's edges instead of smearing them.
                vec2 inside = smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.96, t);
                src = texture2D(uTex, t).rg * inside.x * inside.y;
            }
            float L = src.r * uForm;

            // Slow swell plus a finer chop, both travelling sideways.
            float t = uTime;
            float swell = sin(px.x * 0.0042 + px.y * 0.0031 + t * 0.55)
                        + 0.55 * sin(px.x * 0.0105 - px.y * 0.0017 - t * 0.8)
                        + 0.8 * (noise(vec2(px.x * 0.004 + t * 0.12, px.y * 0.006)) - 0.5);
            // Calm the water over the subject so it stays legible.
            float waves = swell * uAmp * uGap * (1.0 - 0.75 * L);

            // Ripple rings from the pointer as it moves...
            vec2 dm = px - uMouse.xy;
            float d = length(dm);
            float ripple = sin(d * 0.045 - t * 5.0) * exp(-d * 0.006) * uMouse.z * uGap * 2.2;
            // ...and the lines part around it like a finger through water.
            float bulge = -dm.y / sqrt(dm.y * dm.y + 900.0) * exp(-d * d / 42000.0) * uGap * 3.2 * step(-9000.0, uMouse.x);

            float relief = L * uRelief * uGap;
            float disp = relief + waves + ripple + bulge;
            float f = (px.y + disp) / uGap;

            float dl = abs(fract(f + 0.5) - 0.5);
            float aa = fwidth(f) * 0.9;
            vec3 col;
            float w;

            if (uHasPhoto > 0.5) {
                // Photo mode: the picture is drawn through the lines and bends
                // with them; lines are thick where it's bright, thin where dark.
                float py = px.y + disp * 0.7;
                vec2 tp = vec2(vUv.x, py / uRes.y) * uScale + uOffset;
                vec2 inP = smoothstep(0.0, 0.03, tp) * smoothstep(1.0, 0.97, tp);
                vec3 ph = texture2D(uPhoto, clamp(tp, 0.0, 1.0)).rgb * inP.x * inP.y;
                float lum = dot(ph, vec3(0.299, 0.587, 0.114));
                // Keep the colour (the red light) on the subject; fade the
                // studio's red glow at the sides to grey.
                ph = mix(ph, vec3(lum) * 0.8, smoothstep(0.17, 0.36, abs(tp.x - 0.5)));
                w = mix(0.07, 0.47, smoothstep(0.03, 0.62, lum));
                col = mix(uInk * 0.35, ph * 1.3 + 0.03, uForm);

                if (uGlitch > 0.0) {
                    // Watch_Dogs (DedSec) mask over the face: black and white
                    // cells of random characters, hatched blocks and solid
                    // blocks, picked by the face's brightness and reshuffled
                    // constantly, with torn bands. It never clears; the
                    // pointer only makes it worse.
                    float C = uGap * 2.0;          // cell size, CSS px
                    float st = floor(t * 11.0);    // stutter clock
                    float st2 = floor(t * 3.0);    // character reshuffle clock
                    float near = exp(-d * d / 40000.0) * (0.35 + uMouse.z) * step(-9000.0, uMouse.x);
                    float band = floor(px.y / C);
                    float tear = step(0.78 - near * 0.4, hash(vec2(band, st)));
                    float burst = step(0.82, hash(vec2(st2, 9.1)));
                    float shiftPx = floor(tear * (hash(vec2(band, st + 7.0)) - 0.5) * (3.0 + 5.0 * burst + 4.0 * near)) * C;
                    vec2 sp = px + vec2(shiftPx, 0.0);
                    vec2 blk = floor(sp / C);
                    vec2 lc = fract(sp / C);       // position inside the cell, y down
                    vec2 btc = ((blk + 0.5) * C / uRes) * uScale + uOffset;
                    // Skull silhouette: a tall cranium plus a narrower jaw,
                    // with a ragged cell-by-cell edge.
                    float skull = min(length((btc - uGlitchArea.xy) / uGlitchArea.zw),
                                      length((btc - uJaw.xy) / uJaw.zw));
                    float m = skull + hash(blk + st2 * 0.13) * 0.22;
                    float on = step(m, 1.0) * step(hash(blk * 1.31), uForm * 1.15 - 0.1) * uGlitch;
                    // Blocky eye sockets: the real eyes look out through the mask.
                    float eye = min(length((btc - uEyes.xy) / uEyeSize), length((btc - uEyes.zw) / uEyeSize));
                    float socket = on * (1.0 - step(1.0, eye + (hash(blk + st2 * 0.29) - 0.5) * 0.45));
                    if (socket > 0.5) {
                        // The eyes as a grainy black-and-white feed: high
                        // contrast, re-rolled grain, a few grey levels (so it
                        // dithers like the mask's bitmap) and scanlines.
                        float ey = smoothstep(0.04, 0.6, dot(ph, vec3(0.299, 0.587, 0.114)));
                        float grain = hash(floor(px * 0.75) + floor(t * 12.0) * 17.31) - 0.5;
                        ey = clamp(ey + grain * 0.35, 0.0, 1.0);
                        ey = floor(ey * 4.0 + 0.5) / 4.0;
                        ey *= 0.85 + 0.15 * step(0.5, fract(px.y / 3.0));
                        col = vec3(ey);
                        w = 1.0;
                    } else if (on > 0.5) {
                        float cl = smoothstep(0.16, 0.62, dot(texture2D(uPhoto, btc).rgb, vec3(0.299, 0.587, 0.114)));
                        float r = hash(blk + vec2(st2 * 0.71, 1.3));
                        float fast = hash(blk + vec2(st, 5.7));
                        vec3 gc = vec3(0.0);
                        // Nasal cavity: an empty triangle widening downwards.
                        vec2 nq = btc - uNose.xy;
                        float nose = step(0.0, nq.y) * step(nq.y, uNose.w)
                                   * step(abs(nq.x), uNose.z * (0.3 + 0.7 * nq.y / uNose.w));
                        // Teeth: a row of bars over the mouth.
                        float teeth = step(abs(btc.x - uMouth.x), uMouth.z) * step(abs(btc.y - uMouth.y), uMouth.w);
                        if (nose > 0.5) {
                            gc = vec3(0.0);
                        } else if (teeth > 0.5) {
                            gc = vec3(0.86) * step(0.2, lc.x) * step(lc.x, 0.8) * step(0.08, lc.y) * step(lc.y, 0.92);
                        } else if (cl > 0.3 && r < 0.12 + cl * 0.22) {
                            // Hatched grey block.
                            gc = vec3(0.5 + 0.3 * cl) * step(0.5, fract((lc.x + lc.y) * 3.0));
                        } else if (cl > 0.1 && r < 0.8) {
                            // A random character; some flicker every frame.
                            float gi = floor(hash(blk + vec2(st2, 9.0)) * uGlyphCount);
                            if (fast > 0.9) gi = floor(fast * 1000.0) - floor(floor(fast * 1000.0) / uGlyphCount) * uGlyphCount;
                            vec2 guv = vec2((gi + clamp(lc.x, 0.02, 0.98)) / uGlyphCount, lc.y);
                            gc = vec3(mix(0.55, 1.0, cl) * texture2D(uGlyphs, guv).r);
                        } else if (cl > 0.6 && r > 0.94) {
                            gc = vec3(0.9);
                        }
                        if (fast > 0.988) gc = vec3(1.0) - gc;   // the odd inverted cell
                        col = gc;
                        w = 1.0;
                    }
                }
            } else {
                // Lines thicken where the source is bright, like an engraving.
                w = 0.05 + 0.2 * L;
                col = mix(uInk, uAccent, clamp(src.g * uForm, 0.0, 1.0) * 0.85);
            }
            float a = 1.0 - smoothstep(w - aa, w + aa, dl);

            // Wipe-in from the left with a ragged edge.
            float edge = uReveal * 1.25 - 0.12 + (noise(vec2(px.y * 0.02, 3.0)) - 0.5) * 0.12;
            float shown = 1.0 - smoothstep(edge - 0.08, edge, vUv.x);
            a *= shown;

            // Soft vignette so the field fades into the page at the edges.
            vec2 v = vUv * 2.0 - 1.0;
            a *= mix(0.28, 1.0, 1.0 - smoothstep(0.35, 1.25, length(v * vec2(0.85, 1.0))));

            gl_FragColor = vec4(col * a, a);
        }
    `;

    function hexToRgb(hex) {
        const n = parseInt(hex.replace('#', ''), 16);
        return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    }

    // Turns a photo into the shader's source texture: r = smoothed relief
    // (brightness, isolated to the subject), g = how red the light is.
    function prepPhoto(img, focus) {
        const W = 520, H = Math.round(W * img.naturalHeight / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.filter = 'blur(2.5px)';
        ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H);
        const p = data.data;
        const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                let v = sm(0.03, 0.52, Math.max(luma, r));
                // Keep the subject, drop the studio around it.
                const ex = (x / W - focus.x) / focus.rx, ey = (y / H - focus.y) / focus.ry;
                v *= 1 - sm(0.7, 1.05, Math.sqrt(ex * ex + ey * ey));
                const red = Math.max(0, r - (g + b) * 0.5);
                p[i] = v * 255;
                p[i + 1] = sm(0.22, 0.5, red) * 255;
                p[i + 2] = 0;
                p[i + 3] = 255;
            }
        }
        ctx.putImageData(data, 0, 0);
        return c;
    }

    class WaveLines {
        constructor(canvas, opts = {}) {
            this.canvas = canvas;
            this.opts = Object.assign({
                gap: 8, mobileGap: 6, relief: 2.0, amp: 0.55,
                ink: '#ece8df', accent: '#ff4a3d',
                source: null, draw: null,
                focus: { x: 0.5, y: 0.42, rx: 0.3, ry: 0.66 },
                interactive: true, maxDpr: 1.5, maxPixels: 2.2e6,
                photo: false, narrowZoom: 1.75,
            }, opts);
            this.form = this.opts.form ?? 1;
            this.reveal = this.opts.reveal ?? 1;
            this.mouse = { x: -9999, y: -9999, s: 0, ts: 0 };
            this.time = 0;
            this.visible = true;
            this.paused = false; // set by callers for canvases the observer can't judge (e.g. fixed)
            this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            try { this.ready = this.init(); }
            catch (e) { console.warn('WaveLines:', e); this.gl = null; this.ready = Promise.resolve(false); }
        }

        init() {
            const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
            if (!gl || !gl.getExtension('OES_standard_derivatives')) return Promise.resolve(false);
            this.gl = gl;

            const sh = (type, src) => {
                const s = gl.createShader(type);
                gl.shaderSource(s, src); gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
                return s;
            };
            const prog = gl.createProgram();
            gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
            gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(prog);
            gl.useProgram(prog);
            this.u = {};
            ['uRes', 'uTime', 'uGap', 'uRelief', 'uForm', 'uReveal', 'uHasTex', 'uTex', 'uScale', 'uOffset',
             'uMouse', 'uInk', 'uAccent', 'uAmp', 'uPhoto', 'uHasPhoto', 'uGlitch', 'uGlitchArea', 'uGlyphs', 'uGlyphCount', 'uEyes', 'uEyeSize', 'uJaw', 'uNose', 'uMouth'].forEach(n => this.u[n] = gl.getUniformLocation(prog, n));

            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(prog, 'aPos');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

            gl.uniform3fv(this.u.uInk, hexToRgb(this.opts.ink));
            gl.uniform3fv(this.u.uAccent, hexToRgb(this.opts.accent));
            gl.uniform1f(this.u.uRelief, this.opts.relief);
            gl.uniform1f(this.u.uAmp, this.opts.amp);
            gl.uniform1f(this.u.uHasTex, 0);
            gl.uniform1i(this.u.uTex, 0);
            gl.uniform1i(this.u.uPhoto, 1);
            gl.uniform1f(this.u.uHasPhoto, 0);
            const glitch = this.opts.glitch;
            gl.uniform1f(this.u.uGlitch, glitch ? 1 : 0);
            if (glitch) {
                gl.uniform4f(this.u.uGlitchArea, glitch.x, glitch.y, glitch.rx, glitch.ry);
                const e = glitch.eyes || { left: [-9, -9], right: [-9, -9], size: [0.01, 0.01] };
                gl.uniform4f(this.u.uEyes, e.left[0], e.left[1], e.right[0], e.right[1]);
                gl.uniform2f(this.u.uEyeSize, e.size[0], e.size[1]);
                const off = [-9, -9, 0.001, 0.001];
                gl.uniform4f(this.u.uJaw, ...(glitch.jaw || off));
                gl.uniform4f(this.u.uNose, ...(glitch.nose || off));
                gl.uniform4f(this.u.uMouth, ...(glitch.mouth || off));
                gl.uniform1i(this.u.uGlyphs, 3);
                this.makeGlyphs();
                // Redraw once the mono font has loaded.
                document.fonts?.ready.then(() => this.makeGlyphs());
            }
            this.srcAspect = 1;

            this.resize();
            new ResizeObserver(() => this.resize()).observe(this.canvas);
            new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.kick(); })
                .observe(this.canvas);

            if (this.opts.interactive) {
                const move = e => {
                    const r = this.canvas.getBoundingClientRect();
                    const x = e.clientX - r.left, y = e.clientY - r.top;
                    const v = Math.hypot(x - this.mouse.x, y - this.mouse.y);
                    this.mouse.x = x; this.mouse.y = y;
                    if (this.still) this.kick();
                    if (v < 400) this.mouse.ts = Math.min(1, this.mouse.ts + v / 120);
                };
                window.addEventListener('pointermove', move, { passive: true });
            }

            this.last = performance.now();
            this.kick();
            return this.loadSource().then(() => true);
        }

        loadSource() {
            const { source, draw } = this.opts;
            if (draw) {
                const c = document.createElement('canvas');
                c.width = 640; c.height = 400;
                draw(c.getContext('2d'), c.width, c.height);
                this.setTexture(c);
                return Promise.resolve();
            }
            if (!source) return Promise.resolve();
            return new Promise(res => {
                const img = new Image();
                img.onload = () => {
                    if (this.opts.photo) this.setPhoto(img);
                    this.setTexture(prepPhoto(img, this.opts.focus));
                    res();
                };
                img.onerror = () => res();
                img.src = source;
            });
        }

        // The glitch's character set, drawn white on black in one row.
        makeGlyphs() {
            const chars = '0#@MgpQ&%4Y$!^~|/_=+?79Pj';
            const S = 64;
            const c = document.createElement('canvas');
            c.width = S * chars.length; c.height = S;
            const x = c.getContext('2d');
            x.fillStyle = '#000';
            x.fillRect(0, 0, c.width, S);
            x.fillStyle = '#fff';
            x.font = `600 ${S * 0.8}px "Geist Mono", ui-monospace, monospace`;
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            [...chars].forEach((ch, i) => x.fillText(ch, i * S + S / 2, S * 0.54));
            const gl = this.gl;
            gl.activeTexture(gl.TEXTURE3);
            this.bindNew(c);
            gl.activeTexture(gl.TEXTURE0);
            gl.uniform1f(this.u.uGlyphCount, chars.length);
            this.kick();
        }

        setPhoto(img) {
            const gl = this.gl;
            gl.activeTexture(gl.TEXTURE1);
            this.bindNew(img);
            gl.activeTexture(gl.TEXTURE0);
            gl.uniform1f(this.u.uHasPhoto, 1);
        }

        bindNew(source) {
            const gl = this.gl;
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        setTexture(c) {
            const gl = this.gl;
            this.bindNew(c);
            this.srcAspect = c.width / c.height;
            gl.uniform1f(this.u.uHasTex, 1);
            this.fit();
            this.kick();
        }

        // Cover-fit the source; on tall screens bias towards its focus point.
        fit() {
            if (!this.gl) return;
            const ca = this.w / this.h, ia = this.srcAspect, f = this.opts.focus;
            let sx = 1, sy = 1;
            if (ca > ia) sy = ia / ca; else sx = ca / ia;
            // On narrow screens pull back a little so the whole head fits.
            // and sits in the upper part, clear of the title.
            const narrow = ca < 0.8;
            const z = narrow ? this.opts.narrowZoom : 1;
            sx *= z; sy *= z;
            const clampIn = (o, s) => s <= 1 ? Math.min(Math.max(o, 0), 1 - s) : o;
            const ox = clampIn(f.x - sx / 2, sx);
            const oy = clampIn(f.y + (narrow ? 0.16 : 0) - sy / 2, sy);
            this.gl.uniform2f(this.u.uScale, sx, sy);
            this.gl.uniform2f(this.u.uOffset, ox, oy);
        }

        resize() {
            const r = this.canvas.getBoundingClientRect();
            this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
            const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr,
                                 Math.sqrt(this.opts.maxPixels / (this.w * this.h)));
            this.canvas.width = Math.round(this.w * dpr);
            this.canvas.height = Math.round(this.h * dpr);
            const gl = this.gl;
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.uniform2f(this.u.uRes, this.w, this.h);
            gl.uniform1f(this.u.uGap, this.w < 700 ? this.opts.mobileGap : this.opts.gap);
            this.fit();
            this.kick();
        }

        kick() {
            if (this.raf || !this.gl) return;
            if (this.paused && this.drawn) return;
            this.drawn = true;
            this.raf = requestAnimationFrame(t => this.frame(t));
        }

        frame(now) {
            this.raf = 0;
            const dt = Math.min(0.05, (now - this.last) / 1000);
            this.last = now;
            if (!this.still) this.time += dt;

            const m = this.mouse;
            m.s += (m.ts - m.s) * 0.08;
            m.ts *= 0.94;

            const gl = this.gl;
            gl.uniform1f(this.u.uTime, this.time);
            gl.uniform1f(this.u.uForm, this.form);
            gl.uniform1f(this.u.uReveal, this.reveal);
            gl.uniform3f(this.u.uMouse, m.x, m.y, this.still ? 0 : m.s);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Keep animating while on screen; reduced motion draws on demand.
            if (this.visible && !this.paused && !this.still) this.kick();
        }

        // Redraw after a property change (needed when paused or reduced motion).
        redraw() { this.kick(); }
    }

    window.WaveLines = WaveLines;
})();
