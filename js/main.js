/* ==========================================================================
   RIVALDO IMÓVEIS — main.js
   Módulos:
   1. Dados (js/data.js) + PropertyService
   2. Utilitários e formatação
   3. Templates de card
   4. Header (scroll + menu mobile + link ativo)
   5. Fundo do Hero (+ 5b. água e vento em WebGL)
   6. Busca & filtros
   7. Grid de resultados
   8. Carrossel de destaques
   9. Animações (IntersectionObserver)
   10. Inicialização
   ========================================================================== */

(() => {
  'use strict';

  document.documentElement.classList.add('js');

  /* ------------------------------------------------------------------------
     1. DADOS — vêm do painel pela API pública (js/data.js).
     ------------------------------------------------------------------------ */
  const { PropertyService, ZONES, zoneLabel } = window.RivaldoData;

  /* ------------------------------------------------------------------------
     2. UTILITÁRIOS
     ------------------------------------------------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const formatPrice = (p) => currency.format(p.price);

  const escapeHTML = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const uniqueSorted = (list, key) => [...new Set(list.map((i) => i[key]))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const fillSelect = (select, items, placeholder) => {
    const current = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` +
      items.map((i) => {
        const value = typeof i === 'string' ? i : i.value;
        const label = typeof i === 'string' ? i : i.label;
        return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
      }).join('');
    // Mantém a seleção se ainda existir
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  };

  const debounce = (fn, wait = 150) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* Imagens: fade ao carregar e placeholder elegante em caso de erro */
  const handleImages = (root) => {
    $$('.pcard__media img', root).forEach((image) => {
      const done = () => image.classList.add('is-loaded');
      const fail = () => image.parentElement.classList.add('is-broken');
      if (image.complete) {
        image.naturalWidth ? done() : fail();
      } else {
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', fail, { once: true });
      }
    });
  };

  /* ------------------------------------------------------------------------
     3. TEMPLATES
     ------------------------------------------------------------------------ */
  const metaList = (p) => `
    <ul class="pcard__meta" aria-label="Características">
      <li><svg class="icon" aria-hidden="true"><use href="#i-bed"/></svg>${plural(p.bedrooms, 'quarto', 'quartos')}</li>
      <li><svg class="icon" aria-hidden="true"><use href="#i-bath"/></svg>${plural(p.bathrooms, 'banheiro', 'banheiros')}</li>
      <li><svg class="icon" aria-hidden="true"><use href="#i-car"/></svg>${plural(p.parking, 'vaga', 'vagas')}</li>
      <li><svg class="icon" aria-hidden="true"><use href="#i-area"/></svg>${p.area} m²</li>
    </ul>`;

  /* "A partir de" para lançamentos / várias plantas (opção no painel) */
  const priceHTML = (p) =>
    `<p class="pcard__price">${p.priceFrom ? '<span class="pcard__from">A partir de</span>' : ''}${formatPrice(p)}${p.purpose === 'aluguel' ? '<small>/mês</small>' : ''}</p>`;

  const priceText = (p) => `${p.priceFrom ? 'a partir de ' : ''}${formatPrice(p)}`;

  /* "Moema · Zona Sul" (sem zona: "Bairro — Cidade") */
  const locationText = (p) => {
    const zone = zoneLabel(p.zone);
    return zone ? `${p.neighborhood} · ${zone}` : [p.neighborhood, p.city].filter(Boolean).join(' — ');
  };

  /**
   * @param {object} p imóvel
   * @param {'grid'|'feature'} variant
   * @param {number} index usado para escalonar a animação
   */
  const cardTemplate = (p, variant = 'grid', index = 0) => {
    const title = escapeHTML(p.title);
    const loc = escapeHTML(locationText(p));
    const href = `imovel.html?id=${p.id}`;
    const tags = [
      p.status === 'reservado' ? '<span class="tag">Reservado</span>' : '',
      p.purpose === 'aluguel' ? '<span class="tag">Aluguel</span>' : ''
    ].join('');
    const media = `
      <div class="pcard__media">
        <img src="${p.image}" alt="${title} em ${loc}" loading="lazy" decoding="async" width="1200" height="900">
        <div class="pcard__shade"></div>
      </div>
      ${tags ? `<div class="pcard__tags">${tags}</div>` : ''}
      <span class="pcard__go" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-arrow-up-right"/></svg></span>`;

    if (variant === 'feature') {
      return `
        <article class="pcard pcard--feature">
          ${media}
          <div class="pcard__body">
            <p class="pcard__kicker">${escapeHTML(p.type)}</p>
            <h3 class="pcard__title">${title}</h3>
            <p class="pcard__loc"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg>${loc}</p>
            ${priceHTML(p)}
            <div class="pcard__reveal"><div>${metaList(p)}</div></div>
          </div>
          <a class="pcard__link" href="${href}" aria-label="Ver imóvel: ${title}, ${loc}, ${priceText(p)}"></a>
        </article>`;
    }

    return `
      <article class="pcard" style="--i:${index}">
        ${media}
        <div class="pcard__body">
          <p class="pcard__kicker">${escapeHTML(p.type)}</p>
          <h3 class="pcard__title">${title}</h3>
          <p class="pcard__loc"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg>${loc}</p>
          ${priceHTML(p)}
          ${metaList(p)}
          <span class="pcard__cta">Ver imóvel <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></span>
        </div>
        <a class="pcard__link" href="${href}" aria-label="Ver imóvel: ${title}, ${loc}, ${priceText(p)}"></a>
      </article>`;
  };

  /* ------------------------------------------------------------------------
     4. HEADER
     ------------------------------------------------------------------------ */
  const Header = {
    init() {
      this.header = $('#header');
      this.nav = $('#nav');
      this.burger = $('#burger');
      this.float = $('.whats-float');
      this.hero = $('#inicio');

      this.onScroll();
      window.addEventListener('scroll', () => requestAnimationFrame(() => this.onScroll()), { passive: true });

      this.burger.addEventListener('click', () => this.toggle());
      $$('.nav__link', this.nav).forEach((a) => a.addEventListener('click', () => this.toggle(false)));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.toggle(false); });
      window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) this.toggle(false); });

      this.trackSections();
    },

    onScroll() {
      const y = window.scrollY;
      this.header.classList.toggle('is-scrolled', y > 40);
      this.float.classList.toggle('is-visible', y > this.hero.offsetHeight * 0.8);
    },

    get isOpen() { return this.nav.classList.contains('is-open'); },

    toggle(force) {
      const open = typeof force === 'boolean' ? force : !this.isOpen;
      if (open === this.isOpen) return;
      this.nav.classList.toggle('is-open', open);
      this.burger.setAttribute('aria-expanded', String(open));
      this.burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      document.body.classList.toggle('is-locked', open);
      if (open) $('.nav__link', this.nav).focus({ preventScroll: true });
    },

    /* Marca no menu a seção visível */
    trackSections() {
      const links = $$('.nav__link[href^="#"]', this.nav);
      const map = new Map(links.map((l) => [l.getAttribute('href').slice(1), l]));
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const link = map.get(entry.target.id);
          if (!link) return;
          links.forEach((l) => { l.classList.remove('is-active'); l.removeAttribute('aria-current'); });
          link.classList.add('is-active');
          link.setAttribute('aria-current', 'true');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      map.forEach((_, id) => { const s = document.getElementById(id); if (s) observer.observe(s); });
    }
  };

  /* ------------------------------------------------------------------------
     5. FUNDO DO HERO
     Dois modos (atributo data-bg na <section class="hero">):
       "codex"    → imagem com câmera lenta + luz dourada (CSS)
       "original" → vídeo assets/videos/hero-imovel.mp4 + fallback estático
     ------------------------------------------------------------------------ */
  const HeroBackground = {
    STORAGE_KEY: 'rv-hero-bg',

    init() {
      this.hero = $('#inicio');
      this.video = $('#heroVideo');
      this.pauseBtn = $('#heroPause');
      if (!this.hero) return;

      // Fundo definitivo: animação ("codex"). Apaga a escolha salva pelo antigo botão de teste.
      try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) { /* storage bloqueado */ }
      this.setMode(this.hero.dataset.bg || 'codex');

      this.pauseBtn.addEventListener('click', () => this.setPaused(!this.paused));

      // Pausa quando a aba fica oculta ou o hero sai da tela (performance)
      document.addEventListener('visibilitychange', () => this.updatePlayback());
      new IntersectionObserver(([entry]) => {
        this.hero.classList.toggle('is-offscreen', !entry.isIntersecting);
        this.updatePlayback();
      }).observe(this.hero);
    },

    setMode(mode) {
      const valid = mode === 'original' ? 'original' : 'codex';
      this.hero.dataset.bg = valid;
      if (valid === 'original') this.loadVideo();
      this.updatePlayback();
    },

    /* O vídeo só é baixado se o modo "original" estiver ativo */
    loadVideo() {
      const video = this.video;
      if (!video || this.videoLoaded) return;
      const saveData = navigator.connection && navigator.connection.saveData;
      if (prefersReducedMotion.matches || saveData) { video.classList.add('is-hidden'); return; }

      this.videoLoaded = true;
      const sources = $$('source', video);
      let failed = 0;
      const fail = () => video.classList.add('is-hidden');
      sources.forEach((s) => s.addEventListener('error', () => { if (++failed === sources.length) fail(); }));
      video.addEventListener('error', fail);
      video.addEventListener('playing', () => video.classList.add('is-ready'), { once: true });
      video.preload = 'auto';
      video.load();
    },

    setPaused(paused) {
      this.paused = paused;
      this.hero.classList.toggle('is-paused', paused);
      this.pauseBtn.setAttribute('aria-pressed', String(paused));
      this.pauseBtn.setAttribute('aria-label', paused ? 'Retomar animação de fundo' : 'Pausar animação de fundo');
      this.updatePlayback();
    },

    updatePlayback() {
      const video = this.video;
      if (!video || !this.videoLoaded || video.classList.contains('is-hidden')) return;
      const shouldPlay = this.hero.dataset.bg === 'original' && !this.paused &&
        !document.hidden && !this.hero.classList.contains('is-offscreen');
      shouldPlay ? video.play().catch(() => {}) : video.pause();
    }
  };

  /* ------------------------------------------------------------------------
     5b. ÁGUA & VENTO NO FUNDO (WebGL)
     Um shader distorce apenas regiões marcadas numa máscara:
       R = água da piscina · G = vegetação · B = cascata da borda infinita
     (assets/images/hero-imovel-mask.png). Se WebGL não existir, fica a
     imagem estática com a animação de câmera em CSS.
     Obs.: abrindo por file://, o navegador bloqueia imagens locais no WebGL;
     por isso carregamos uma cópia embutida (hero-imovel.embed.js).
     ------------------------------------------------------------------------ */
  const HeroWater = {
    VERT: `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        vUv.y = 1.0 - vUv.y;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }`,

    FRAG: `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
      #else
        precision mediump float;
      #endif
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform sampler2D uMask;
      uniform vec2 uScale;
      uniform vec2 uOffset;
      uniform float uTime;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec2 uv = uOffset + vUv * uScale;
        vec3 m = texture2D(uMask, uv).rgb;
        float t = uTime;
        vec2 d = vec2(0.0);

        // Água: ondulação horizontal, maior perto da câmera (perspectiva)
        if (m.r > 0.002) {
          float near = clamp((uv.y - 0.62) / 0.38, 0.0, 1.0);
          vec2 p = vec2(uv.x * mix(24.0, 12.0, near), uv.y * mix(280.0, 110.0, near));
          float n1 = noise(p + vec2(t * 0.30, -t * 0.85));
          float n2 = noise(p * 1.9 + vec2(-t * 0.45, -t * 1.30));
          float amp = mix(0.0010, 0.0034, near);
          d += m.r * vec2((n1 - 0.5) * amp * 1.7 + (n2 - 0.5) * amp * 0.7, (n2 - 0.5) * amp * 0.45);
        }

        // Vegetação: balanço lento com rajadas + tremular das folhas
        if (m.g > 0.002) {
          float gust = 0.55 + 0.45 * sin(t * 0.55 + uv.x * 3.0) * (0.6 + 0.4 * sin(t * 0.23));
          float sway = noise(uv * vec2(6.0, 5.0) + vec2(t * 0.25, t * 0.08)) - 0.5;
          float flutter = noise(uv * vec2(70.0, 60.0) + vec2(t * 1.6, -t * 1.1)) - 0.5;
          d += m.g * vec2(sway * 0.0034 * gust + flutter * 0.0010, flutter * 0.0007 + sway * 0.0010 * gust);
        }

        // Cascata: fios d'água descendo pela face da borda infinita
        if (m.b > 0.002) {
          float s = noise(vec2(uv.x * 420.0, uv.y * 28.0 - t * 2.6));
          d += m.b * vec2((s - 0.5) * 0.0005, (s - 0.5) * 0.0030);
        }

        vec3 col = texture2D(uTex, uv + d).rgb;

        // Cintilar dourado nas reflexões da água
        if (m.r > 0.002) {
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          float sp = noise(vec2(uv.x * 140.0, uv.y * 520.0) + vec2(t * 0.4, -t * 1.8));
          col += m.r * smoothstep(0.35, 0.85, lum) * smoothstep(0.62, 0.95, sp) * 0.16 * vec3(1.0, 0.88, 0.66);
        }
        if (m.b > 0.002) {
          float st = noise(vec2(uv.x * 600.0, uv.y * 18.0 - t * 3.2));
          col += m.b * smoothstep(0.72, 1.0, st) * 0.06;
        }

        gl_FragColor = vec4(col, 1.0);
      }`,

    init() {
      this.hero = $('#inicio');
      this.camera = $('.hero__camera');
      this.img = $('.hero__camera img');
      if (!this.hero || !this.camera || prefersReducedMotion.matches) return;

      const canvas = document.createElement('canvas');
      canvas.className = 'hero__canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
      if (!gl) return;
      this.canvas = canvas;
      this.gl = gl;

      this.loadSources()
        .then(([image, mask]) => this.setup(image, mask))
        .catch(() => canvas.remove()); // sem efeito, mas a imagem continua
    },

    loadImage(src) {
      return new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = src;
      });
    },

    loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    },

    loadSources() {
      if (location.protocol === 'file:') {
        return this.loadScript('assets/images/hero-imovel.embed.js').then(() =>
          Promise.all([this.loadImage(window.HERO_EMBED.image), this.loadImage(window.HERO_EMBED.mask)]));
      }
      const imgReady = this.img.complete && this.img.naturalWidth
        ? Promise.resolve(this.img)
        : new Promise((res, rej) => { this.img.addEventListener('load', () => res(this.img), { once: true }); this.img.addEventListener('error', rej, { once: true }); });
      return Promise.all([imgReady, this.loadImage('assets/images/hero-imovel-mask.png')]);
    },

    compile(type, source) {
      const { gl } = this;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    },

    texture(unit, source) {
      const { gl } = this;
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      return tex;
    },

    setup(image, mask) {
      const { gl, canvas } = this;
      const program = gl.createProgram();
      gl.attachShader(program, this.compile(gl.VERTEX_SHADER, this.VERT));
      gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, this.FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.texture(0, image);
      this.texture(1, mask);
      gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 1);
      this.u = {
        scale: gl.getUniformLocation(program, 'uScale'),
        offset: gl.getUniformLocation(program, 'uOffset'),
        time: gl.getUniformLocation(program, 'uTime')
      };
      this.imageSize = { w: image.naturalWidth || image.width, h: image.naturalHeight || image.height };

      this.img.after(canvas);
      this.resize();
      new ResizeObserver(() => this.resize()).observe(this.camera);
      canvas.addEventListener('webglcontextlost', () => { cancelAnimationFrame(this.raf); canvas.remove(); });

      this.time = 0;
      this.last = performance.now();
      this.raf = requestAnimationFrame((now) => this.frame(now));
    },

    /* Reproduz object-fit: cover + object-position da <img> original */
    resize() {
      const { gl, canvas, imageSize } = this;
      const cw = this.camera.clientWidth;
      const ch = this.camera.clientHeight;
      if (!cw || !ch) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = Math.min(1, 2200 / (cw * dpr));
      canvas.width = Math.round(cw * dpr * scale);
      canvas.height = Math.round(ch * dpr * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);

      const s = Math.max(cw / imageSize.w, ch / imageSize.h);
      const sx = cw / s / imageSize.w;
      const sy = ch / s / imageSize.h;
      const [px, py] = getComputedStyle(this.img).objectPosition.split(' ').map((v) => parseFloat(v) / 100);
      gl.uniform2f(this.u.scale, sx, sy);
      gl.uniform2f(this.u.offset, (1 - sx) * (isNaN(px) ? 0.5 : px), (1 - sy) * (isNaN(py) ? 0.5 : py));
      this.draw();
    },

    shouldRun() {
      const h = this.hero;
      return h.dataset.bg === 'codex' && !document.hidden &&
        !h.classList.contains('is-paused') && !h.classList.contains('is-offscreen');
    },

    draw() {
      const { gl } = this;
      gl.uniform1f(this.u.time, this.time % 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!this.ready) { this.ready = true; this.canvas.classList.add('is-ready'); }
    },

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.shouldRun()) {
        this.time += dt;
        this.draw();
      }
      this.raf = requestAnimationFrame((n) => this.frame(n));
    }
  };

  /* ------------------------------------------------------------------------
     6. BUSCA & FILTROS
     Zona (abas) → Bairro (depende da zona) · Tipo · Quartos · Vagas · Área
     ------------------------------------------------------------------------ */
  const EMPTY_STATE = { zone: '', type: '', neighborhood: '', bedrooms: '', parking: '', area: '', sort: 'recent' };

  const Search = {
    state: { ...EMPTY_STATE },
    applied: false, // após a 1ª busca, mudanças aplicam em tempo real

    labels: {
      zone: (v) => zoneLabel(v) || v,
      type: (v) => v,
      neighborhood: (v) => v,
      bedrooms: (v) => `${v}+ quartos`,
      parking: (v) => `${v}+ vagas`,
      area: (v) => `${v} m²+`
    },

    init() {
      this.form = $('#searchForm');
      this.fields = {
        type: $('#fType'), neighborhood: $('#fNeighborhood'),
        bedrooms: $('#fBedrooms'), area: $('#fArea'), sort: $('#fSort')
      };
      this.tabs = $('.search__tabs', this.form);
      this.more = $('#moreFilters');
      this.moreToggle = $('#moreToggle');

      fillSelect(this.fields.type, uniqueSorted(PropertyService.getAll(), 'type'), 'Todos os tipos');
      this.refreshNeighborhoods();

      this.setupTabs();
      this.setupMoreFilters();
      this.bindEvents();
      this.readURL();
    },

    getZoneFromForm() {
      const checked = $('input[name="zone"]:checked', this.form);
      return checked ? checked.value : '';
    },

    /* Bairros com imóveis publicados; com zona escolhida, só os dela.
       Em "Todas", os bairros aparecem agrupados por zona. */
    refreshNeighborhoods() {
      const select = this.fields.neighborhood;
      const current = select.value;
      const zone = this.getZoneFromForm();
      const all = PropertyService.getAll().filter((p) => p.neighborhood);
      const option = (name) => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`;
      let html = '<option value="">Todos os bairros</option>';

      if (zone) {
        html += uniqueSorted(all.filter((p) => p.zone === zone), 'neighborhood').map(option).join('');
      } else {
        ZONES.forEach((z) => {
          const names = uniqueSorted(all.filter((p) => p.zone === z.value), 'neighborhood');
          if (names.length) html += `<optgroup label="${escapeHTML(z.label)}">${names.map(option).join('')}</optgroup>`;
        });
        const other = uniqueSorted(all.filter((p) => !p.zone), 'neighborhood');
        if (other.length) html += `<optgroup label="Outros bairros">${other.map(option).join('')}</optgroup>`;
      }
      select.innerHTML = html;
      if ([...select.options].some((o) => o.value === current)) select.value = current;
    },

    /* Indicador deslizante das abas de zona (rolam na horizontal no celular) */
    setupTabs() {
      const indicator = $('.search__tab-indicator', this.form);
      const move = (scroll = false) => {
        const tab = $('input[name="zone"]:checked', this.form).closest('.search__tab');
        indicator.style.setProperty('--w', `${tab.offsetWidth}px`);
        indicator.style.setProperty('--x', `${tab.offsetLeft}px`);
        if (scroll && this.tabs.scrollWidth > this.tabs.clientWidth) {
          const left = tab.offsetLeft - (this.tabs.clientWidth - tab.offsetWidth) / 2;
          this.tabs.scrollTo({ left, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
        }
      };
      this.moveIndicator = move;
      move();
      window.addEventListener('resize', debounce(() => move(), 100));
      document.fonts && document.fonts.ready.then(() => move());
    },

    setupMoreFilters() {
      const inner = $('.search__more-inner', this.more);
      inner.inert = true;
      this.moreToggle.addEventListener('click', () => {
        const open = !this.more.classList.contains('is-open');
        this.more.classList.toggle('is-open', open);
        this.moreToggle.setAttribute('aria-expanded', String(open));
        inner.inert = !open;
      });
    },

    /* Conta filtros extras ativos e mostra no botão "Mais filtros" */
    updateMoreBadge() {
      const n = ['parking', 'area'].filter((k) => this.state[k]).length;
      let badge = $('.badge', this.moreToggle);
      if (n && !badge) {
        badge = document.createElement('span');
        badge.className = 'badge';
        this.moreToggle.append(badge);
      }
      if (badge) n ? (badge.textContent = n) : badge.remove();
    },

    readForm() {
      const data = new FormData(this.form);
      return {
        zone: data.get('zone') || '',
        type: data.get('type') || '',
        neighborhood: data.get('neighborhood') || '',
        bedrooms: data.get('bedrooms') || '',
        parking: data.get('parking') || '',
        area: data.get('area') || '',
        sort: this.fields.sort.value
      };
    },

    /* Escreve o estado de volta no formulário (URL, pílulas) */
    writeForm() {
      const s = this.state;
      const radio = (name, value) => {
        const input = $(`input[name="${name}"][value="${value}"]`, this.form);
        if (input) input.checked = true;
      };
      radio('zone', s.zone);
      this.refreshNeighborhoods();
      this.fields.type.value = s.type;
      this.fields.neighborhood.value = s.neighborhood;
      this.fields.bedrooms.value = s.bedrooms;
      this.fields.area.value = s.area;
      this.fields.sort.value = s.sort;
      radio('parking', s.parking);
      this.moveIndicator(true);
    },

    apply({ scroll = false } = {}) {
      this.state = this.readForm();
      this.applied = true;
      this.updateMoreBadge();
      this.writeURL();
      Listings.render({ reset: true });
      if (scroll) {
        $('#imoveis').scrollIntoView({ behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
      }
    },

    reset() {
      this.form.reset();
      this.state = { ...EMPTY_STATE, sort: this.fields.sort.value };
      this.applied = false;
      this.refreshNeighborhoods();
      this.moveIndicator(true);
      this.updateMoreBadge();
      this.writeURL();
      Listings.render({ reset: true });
    },

    /* Remove um único filtro (pílulas acima do grid) */
    remove(key) {
      this.state[key] = '';
      this.writeForm();
      this.updateMoreBadge();
      this.writeURL();
      Listings.render({ reset: true });
    },

    /* Filtragem pura (os imóveis já vêm da API) */
    filter(list, s = this.state) {
      const result = list.filter((p) =>
        (!s.zone || p.zone === s.zone) &&
        (!s.type || p.type === s.type) &&
        (!s.neighborhood || p.neighborhood === s.neighborhood) &&
        (!s.bedrooms || p.bedrooms >= Number(s.bedrooms)) &&
        (!s.parking || p.parking >= Number(s.parking)) &&
        (!s.area || p.area >= Number(s.area))
      );

      const sorters = {
        recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
        'price-asc': (a, b) => a.price - b.price,
        'price-desc': (a, b) => b.price - a.price,
        'area-desc': (a, b) => b.area - a.area
      };
      return result.sort(sorters[s.sort] || sorters.recent);
    },

    activeFilters() {
      return Object.entries(this.state)
        .filter(([k, v]) => v && k !== 'sort' && this.labels[k])
        .map(([k, v]) => ({ key: k, label: this.labels[k](v) }));
    },

    /* Sincroniza com a URL: ?zona=sul&bairro=Moema … */
    urlKeys: { zone: 'zona', type: 'tipo', neighborhood: 'bairro', bedrooms: 'quartos', parking: 'vagas', area: 'area', sort: 'ordem' },

    writeURL() {
      const params = new URLSearchParams();
      Object.entries(this.state).forEach(([k, v]) => {
        if (v && this.urlKeys[k] && !(k === 'sort' && v === 'recent')) params.set(this.urlKeys[k], v);
      });
      const qs = params.toString();
      history.replaceState(null, '', qs ? `?${qs}${location.hash}` : location.pathname + location.hash);
    },

    readURL() {
      const params = new URLSearchParams(location.search);
      if (![...params.keys()].length) return;
      Object.entries(this.urlKeys).forEach(([k, param]) => {
        if (params.has(param)) this.state[k] = params.get(param);
      });
      if (!ZONES.some((z) => z.value === this.state.zone)) this.state.zone = '';
      this.writeForm();
      this.state = this.readForm(); // descarta valores que não existem mais
      this.applied = true;
      this.updateMoreBadge();
    },

    bindEvents() {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.apply({ scroll: true });
      });

      this.form.addEventListener('reset', (e) => {
        e.preventDefault();
        this.reset();
      });

      this.form.addEventListener('change', (e) => {
        const { name } = e.target;
        if (name === 'zone') {
          this.moveIndicator(true);
          this.refreshNeighborhoods(); // bairro de outra zona volta para "Todos"
        }
        if (this.applied) this.apply();
      });

      this.fields.sort.addEventListener('change', () => {
        this.state.sort = this.fields.sort.value;
        this.writeURL();
        Listings.render({ reset: true });
      });
    }
  };

  /* ------------------------------------------------------------------------
     7. GRID DE RESULTADOS
     ------------------------------------------------------------------------ */
  const Listings = {
    visible: 0,

    init() {
      this.grid = $('#propertyGrid');
      this.empty = $('#emptyState');
      this.count = $('#resultsCount');
      this.pills = $('#activeFilters');
      this.moreWrap = $('#loadMoreWrap');
      this.title = $('#listingsTitle');
      this.eyebrow = $('#listingsEyebrow');

      $('#loadMore').addEventListener('click', () => this.render({ append: true }));
      $('#emptyReset').addEventListener('click', () => Search.reset());
      this.pills.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove]');
        if (!btn) return;
        btn.dataset.remove === '*' ? Search.reset() : Search.remove(btn.dataset.remove);
      });

      // Recalcula a paginação quando muda o nº de colunas
      window.addEventListener('resize', debounce(() => {
        const size = this.pageSize();
        if (size !== this.lastPageSize) this.render({ reset: true, animate: false });
      }, 200));

      this.render({ reset: true });
    },

    /* Duas linhas completas, qualquer que seja o nº de colunas */
    pageSize() {
      const cols = getComputedStyle(this.grid).gridTemplateColumns.split(' ').length || 1;
      return Math.max(cols * 2, 4);
    },

    render({ reset = false, append = false, animate = true } = {}) {
      const results = Search.filter(PropertyService.getAll());
      const size = this.pageSize();
      this.lastPageSize = size;

      const start = append ? this.visible : 0;
      this.visible = reset ? Math.min(size, results.length) : Math.min(this.visible + size, results.length);
      const slice = results.slice(start, this.visible);
      const html = slice.map((p, i) => cardTemplate(p, 'grid', animate ? i : 0)).join('');

      if (append) {
        this.grid.insertAdjacentHTML('beforeend', html);
      } else {
        this.grid.innerHTML = html;
      }
      handleImages(this.grid);

      if (!animate) $$('.pcard', this.grid).forEach((c) => (c.style.animation = 'none'));

      // Estado vazio, contagem, "ver mais"
      const none = PropertyService.getAll().length === 0;   // nenhum imóvel publicado ainda
      const zone = zoneLabel(Search.state.zone);
      const onlyZone = zone && Search.activeFilters().length === 1;
      $('.empty__title', this.empty).textContent = none
        ? 'Novos imóveis em breve.'
        : onlyZone ? `Nenhum imóvel na ${zone} no momento.` : 'Nenhum imóvel encontrado com esses filtros.';
      $('.empty__text', this.empty).textContent = none || onlyZone
        ? 'Conte pelo WhatsApp o que você procura: o Rivaldo encontra o imóvel certo para você.'
        : 'Tente outra zona ou remova algum filtro.';
      $('#emptyReset').style.display = none ? 'none' : '';
      this.empty.hidden = results.length > 0;
      this.grid.hidden = results.length === 0;
      this.moreWrap.hidden = this.visible >= results.length;
      this.count.innerHTML = `<b>${results.length}</b> ${results.length === 1 ? 'imóvel' : 'imóveis'}`;

      const filtered = Search.activeFilters().length > 0;
      this.title.textContent = filtered ? 'Resultados da busca' : 'Imóveis recentes';
      this.eyebrow.textContent = filtered ? 'Sua pesquisa' : 'Novidades';

      this.renderPills();
    },

    renderPills() {
      const active = Search.activeFilters();
      this.pills.innerHTML = active.map((f) => `
        <button class="filter-pill" type="button" data-remove="${f.key}" aria-label="Remover filtro ${escapeHTML(f.label)}">
          ${escapeHTML(f.label)}
          <svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>
        </button>`).join('') +
        (active.length > 1 ? '<button class="filter-pill filter-pill--clear link-underline" type="button" data-remove="*">Limpar tudo</button>' : '');
    }
  };

  /* ------------------------------------------------------------------------
     8. CARROSSEL
     Scroll nativo com scroll-snap (swipe fluido no mobile) + animação
     própria com easing nas setas/indicadores.
     ------------------------------------------------------------------------ */
  const Carousel = {
    index: 0,

    init() {
      this.track = $('#carouselTrack');
      this.prev = $('#carouselPrev');
      this.next = $('#carouselNext');
      this.dotsWrap = $('#carouselDots');
      this.progress = $('#carouselProgress');
      this.current = $('#carouselCurrent');
      this.total = $('#carouselTotal');

      const items = PropertyService.getFeatured();
      // Sem destaques marcados no painel: a seção inteira some.
      if (!items.length) {
        $('#destaques').style.display = 'none';
        $$('[data-featured-only]').forEach((el) => (el.style.display = 'none'));
        return;
      }
      this.track.innerHTML = items.map((p, i) => `
        <div class="carousel__slide" role="group" aria-roledescription="slide" aria-label="${i + 1} de ${items.length}">
          ${cardTemplate(p, 'feature')}
        </div>`).join('');
      handleImages(this.track);

      this.slides = $$('.carousel__slide', this.track);
      this.total.textContent = String(this.slides.length).padStart(2, '0');

      this.dotsWrap.innerHTML = this.slides.map((_, i) =>
        `<button class="carousel__dot" type="button" role="tab" aria-label="Ir para o imóvel ${i + 1}" aria-selected="false" data-index="${i}"></button>`).join('');
      this.dots = $$('.carousel__dot', this.dotsWrap);

      this.prev.addEventListener('click', () => this.goTo(this.index - 1));
      this.next.addEventListener('click', () => this.goTo(this.index + 1));
      this.dotsWrap.addEventListener('click', (e) => {
        const dot = e.target.closest('.carousel__dot');
        if (dot) this.goTo(Number(dot.dataset.index));
      });
      this.track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); this.goTo(this.index + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.goTo(this.index - 1); }
      });
      this.track.addEventListener('scroll', () => {
        if (!this.animating) requestAnimationFrame(() => this.sync());
      }, { passive: true });
      window.addEventListener('resize', debounce(() => this.sync(), 120));

      this.enableDrag();
      this.sync();
    },

    /* Posição de scroll correspondente a um slide */
    offsetFor(i) {
      const padding = parseFloat(getComputedStyle(this.track).paddingLeft);
      return this.slides[i].offsetLeft - padding;
    },

    maxScroll() { return this.track.scrollWidth - this.track.clientWidth; },

    goTo(i) {
      const last = this.slides.length - 1;
      const target = Math.max(0, Math.min(i, last));
      this.index = target;
      this.animateTo(Math.min(this.offsetFor(target), this.maxScroll()));
      this.updateUI();
    },

    animateTo(to) {
      const from = this.track.scrollLeft;
      const distance = to - from;
      if (Math.abs(distance) < 1) return;

      if (prefersReducedMotion.matches) { this.track.scrollLeft = to; return; }

      cancelAnimationFrame(this.raf);
      this.animating = true;
      this.track.classList.add('is-animating');
      const duration = Math.min(1100, 650 + Math.abs(distance) * 0.15);
      const start = performance.now();

      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        this.track.scrollLeft = from + distance * easeInOutCubic(t);
        if (t < 1) {
          this.raf = requestAnimationFrame(step);
        } else {
          this.animating = false;
          this.track.classList.remove('is-animating');
        }
      };
      this.raf = requestAnimationFrame(step);
    },

    /* Descobre o slide atual a partir do scroll (swipe/trackpad) */
    sync() {
      const x = this.track.scrollLeft;
      if (x >= this.maxScroll() - 4) {
        // No final, o último slide visível conta como atual
        this.index = this.slides.length - 1;
      } else {
        let closest = 0;
        let min = Infinity;
        this.slides.forEach((_, i) => {
          const d = Math.abs(this.offsetFor(i) - x);
          if (d < min) { min = d; closest = i; }
        });
        this.index = closest;
      }
      this.updateUI();
    },

    updateUI() {
      const n = this.slides.length;
      this.current.textContent = String(this.index + 1).padStart(2, '0');
      this.progress.style.setProperty('--p', ((this.index + 1) / n).toFixed(3));
      this.prev.disabled = this.index === 0;
      this.next.disabled = this.index === n - 1;
      this.dots.forEach((d, i) => d.setAttribute('aria-selected', String(i === this.index)));
      this.slides.forEach((s, i) => s.classList.toggle('is-current', i === this.index));
    },

    /* Arrastar com mouse no desktop (touch já é nativo) */
    enableDrag() {
      let startX = 0;
      let startScroll = 0;
      let dragging = false;
      let moved = false;

      this.track.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = this.track.scrollLeft;
        cancelAnimationFrame(this.raf);
        this.animating = false;
      });

      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 5) {
          moved = true;
          this.track.classList.add('is-animating'); // desliga snap durante o arraste
          this.track.style.cursor = 'grabbing';
        }
        if (moved) this.track.scrollLeft = startScroll - dx;
      });

      window.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        this.track.style.cursor = '';
        if (!moved) return;
        const dx = e.clientX - startX;
        const x = this.track.scrollLeft;
        const offsets = this.slides.map((_, i) => this.offsetFor(i));
        let target;
        if (dx < -60) {
          target = offsets.findIndex((o) => o > x + 10);
          if (target === -1) target = this.slides.length - 1;
        } else if (dx > 60) {
          target = 0;
          offsets.forEach((o, i) => { if (o < x - 10) target = i; });
        } else {
          this.sync();
          target = this.index;
        }
        this.goTo(target);
      });

      // Evita abrir o imóvel ao soltar um arraste
      this.track.addEventListener('click', (e) => {
        if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
      }, true);
      this.track.addEventListener('dragstart', (e) => e.preventDefault());
    }
  };

  /* ------------------------------------------------------------------------
     9. ANIMAÇÕES DE ENTRADA
     ------------------------------------------------------------------------ */
  const Reveal = {
    init() {
      const items = $$('[data-reveal]');
      if (!('IntersectionObserver' in window) || prefersReducedMotion.matches) {
        items.forEach((el) => el.classList.add('is-visible'));
        return;
      }
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      items.forEach((el) => observer.observe(el));
    }
  };

  /* ------------------------------------------------------------------------
     10. INICIALIZAÇÃO
     ------------------------------------------------------------------------ */
  const init = async () => {
    Header.init();
    HeroBackground.init();
    // HeroWater (água/vento em WebGL) usava a máscara da foto antiga; desligado com a foto nova do topo.
    Reveal.init();
    const year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    // Imóveis publicados no painel (a busca, a lista e o carrossel dependem deles)
    $('#resultsCount').textContent = 'Carregando…';
    await PropertyService.load();
    Search.init();
    Listings.init();
    Carousel.init();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
