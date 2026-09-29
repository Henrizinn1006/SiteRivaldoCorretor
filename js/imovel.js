/* ==========================================================================
   RIVALDO IMÓVEIS — imovel.js (página de detalhe: imovel.html?id=1)
   1. Utilitários
   2. Header / menu mobile
   3. Carregamento e renderização
   4. Galeria (mosaico no desktop, deslizar no celular)
   5. Visualizador em tela cheia
   6. Contato (WhatsApp, visita, compartilhar)
   7. Mapa (carrega só quando pedido)
   8. Semelhantes
   ========================================================================== */

(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const { fetchProperty, fetchSimilar, CONTACT, zoneLabel } = window.RivaldoData;

  /* ------------------------------------------------------------------------
     1. UTILITÁRIOS
     ------------------------------------------------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brl = (v) => money.format(v);
  const num = new Intl.NumberFormat('pt-BR');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  /* "A partir de" (opção do painel para lançamentos / várias plantas) */
  const fromLabel = (p) => (p.priceFrom ? '<span class="price-from">A partir de</span>' : '');

  const STATUS = {
    reservado: { label: 'Reservado', notice: 'Este imóvel está <b>reservado</b> no momento. Fale com um consultor para entrar na lista de espera ou conhecer opções parecidas.' },
    vendido: { label: 'Vendido', notice: 'Este imóvel já foi <b>vendido</b>. Separamos abaixo opções semelhantes que podem te interessar.' },
    alugado: { label: 'Alugado', notice: 'Este imóvel já foi <b>alugado</b>. Separamos abaixo opções semelhantes que podem te interessar.' },
    indisponivel: { label: 'Indisponível', notice: 'Este imóvel está temporariamente <b>indisponível</b>.' }
  };
  const isClosed = (p) => p.status === 'vendido' || p.status === 'alugado';

  let toastTimer;
  const toast = (msg) => {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  };

  const waLink = (text) => `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;

  /* Imagem com fade ao carregar e mármore se falhar */
  const watchImage = (image) => {
    const box = image.parentElement;
    const done = () => image.classList.add('is-loaded');
    const fail = () => box.classList.add('is-broken');
    if (image.complete) { image.naturalWidth ? done() : fail(); return; }
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', fail, { once: true });
  };

  /* ------------------------------------------------------------------------
     2. HEADER
     ------------------------------------------------------------------------ */
  const Header = {
    init() {
      this.nav = $('#nav');
      this.burger = $('#burger');
      this.burger.addEventListener('click', () => this.toggle());
      $$('.nav__link', this.nav).forEach((a) => a.addEventListener('click', () => this.toggle(false)));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.toggle(false); });
      window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) this.toggle(false); });
    },
    get isOpen() { return this.nav.classList.contains('is-open'); },
    toggle(force) {
      const open = typeof force === 'boolean' ? force : !this.isOpen;
      if (open === this.isOpen) return;
      this.nav.classList.toggle('is-open', open);
      this.burger.setAttribute('aria-expanded', String(open));
      this.burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      document.body.classList.toggle('is-locked', open);
    }
  };

  /* ------------------------------------------------------------------------
     3. CARREGAMENTO E RENDERIZAÇÃO
     ------------------------------------------------------------------------ */
  const Page = {
    async init() {
      const id = new URLSearchParams(location.search).get('id');
      let property = null;
      try {
        property = await fetchProperty(id);
      } catch (err) {
        this.showMissing('Não foi possível carregar este imóvel agora. Verifique sua conexão e tente novamente.');
        return;
      }
      if (!property) { this.showMissing(); return; }

      this.p = property;
      this.render();
      Gallery.init(property);
      Lightbox.init(property);
      Contact.init(property);
      MapBlock.init(property);
      Similar.init(property);
      this.reveal();
    },

    showMissing(text) {
      document.title = 'Imóvel não encontrado — Rivaldo Duarte';
      if (text) $('#missingText').textContent = text;
      $('#pdLoading').remove();
      $('#pdMissing').hidden = false;
      document.body.classList.remove('is-loading');
      const robots = document.createElement('meta');
      robots.name = 'robots';
      robots.content = 'noindex';
      document.head.appendChild(robots);
    },

    reveal() {
      $('#pdLoading').remove();
      $('#pdContent').hidden = false;
      $('#pdBar').hidden = false;
      document.body.classList.remove('is-loading');
    },

    render() {
      const p = this.p;
      const rent = p.purpose === 'aluguel';
      const zone = zoneLabel(p.zone);
      const loc = [p.neighborhood, zone, p.city && `${p.city}${p.state ? ` — ${p.state}` : ''}`].filter(Boolean).join(', ');

      /* SEO / compartilhamento */
      const priceTxt = `${p.priceFrom ? 'A partir de ' : ''}${brl(p.price)}${rent ? '/mês' : ''}`;
      document.title = `${p.title} — ${p.neighborhood}, ${p.city} | Rivaldo Duarte`;
      const desc = `${p.type} ${rent ? 'para alugar' : 'à venda'} em ${loc}. ${p.area} m², ${plural(p.bedrooms, 'quarto', 'quartos')}, ${plural(p.parking, 'vaga', 'vagas')}. ${priceTxt}.`;
      $('meta[name="description"]').content = desc;
      $('meta[property="og:title"]').content = p.title;
      $('meta[property="og:description"]').content = desc;
      $('meta[property="og:image"]').content = p.images[0] ? p.images[0].lg : '';
      $('link[rel="canonical"]').href = `${location.origin}${location.pathname}?id=${p.id}`;

      /* Trilha */
      $('#crumbs').innerHTML = `
        <li><a href="index.html#imoveis">Imóveis</a></li>
        ${zone ? `<li><a href="index.html?zona=${encodeURIComponent(p.zone)}#imoveis">${esc(zone)}</a></li>` : ''}
        ${p.neighborhood ? `<li><a href="index.html?${p.zone ? `zona=${encodeURIComponent(p.zone)}&amp;` : ''}bairro=${encodeURIComponent(p.neighborhood)}#imoveis">${esc(p.neighborhood)}</a></li>` : ''}
        <li aria-current="page"><span>${esc(p.title)}</span></li>`;

      /* Cabeçalho */
      const status = STATUS[p.status];
      $('#pdTags').innerHTML = `
        ${rent ? '<span class="tag tag--gold">Aluguel</span>' : ''}
        <span class="tag tag--line">${esc(p.type)}</span>
        ${status ? `<span class="tag tag--status tag--${p.status}">${status.label}</span>` : ''}
        <span class="pd-head__code">Cód. ${esc(p.code)}</span>`;
      $('#pdTitle').textContent = p.title;
      $('#pdLoc').textContent = loc;

      /* Números principais */
      const specs = [
        { icon: 'area', value: `${num.format(p.area)} m²`, label: p.totalArea ? 'área útil' : 'área' },
        p.totalArea && { icon: 'expand', value: `${num.format(p.totalArea)} m²`, label: 'terreno' },
        { icon: 'bed', value: p.bedrooms, label: p.bedrooms === 1 ? 'quarto' : 'quartos' },
        p.suites && { icon: 'suite', value: p.suites, label: p.suites === 1 ? 'suíte' : 'suítes' },
        { icon: 'bath', value: p.bathrooms, label: p.bathrooms === 1 ? 'banheiro' : 'banheiros' },
        { icon: 'car', value: p.parking, label: p.parking === 1 ? 'vaga' : 'vagas' }
      ].filter(Boolean);
      $('#pdSpecs').innerHTML = specs.map((s) => `
        <li><svg class="icon" aria-hidden="true"><use href="#i-${s.icon}"/></svg><b>${s.value}</b><span>${s.label}</span></li>`).join('');

      /* Aviso de status */
      if (status) {
        const notice = $('#pdNotice');
        notice.innerHTML = status.notice;
        notice.hidden = false;
        notice.classList.add(`pd-notice--${p.status}`);
      }

      /* Descrição (parágrafos) com "ler mais" quando longa */
      const paragraphs = String(p.description || '').split(/\n{2,}|\r\n\r\n/).map((t) => t.trim()).filter(Boolean);
      const descEl = $('#pdDesc');
      descEl.innerHTML = paragraphs.length
        ? paragraphs.map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('')
        : '<p>Entre em contato para receber a descrição completa deste imóvel.</p>';
      requestAnimationFrame(() => {
        if (descEl.scrollHeight > 320) {
          descEl.classList.add('is-clamped');
          const more = $('#pdMore');
          more.hidden = false;
          more.addEventListener('click', () => {
            const open = descEl.classList.toggle('is-clamped') === false;
            more.setAttribute('aria-expanded', String(open));
            more.textContent = open ? 'Mostrar menos' : 'Ler descrição completa';
          });
        }
      });

      /* Características */
      if (p.features.length) {
        $('#pdFeatures').innerHTML = p.features.map((f) =>
          `<li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>${esc(f)}</li>`).join('');
      } else {
        $('#featuresBlock').hidden = true;
      }

      /* Valores */
      const rows = [
        [rent ? 'Aluguel' : (p.priceFrom ? 'Venda (a partir de)' : 'Venda'), rent ? `${brl(p.price)}<small>/mês</small>` : brl(p.price)],
        p.condoFee && ['Condomínio', `${brl(p.condoFee)}<small>/mês</small>`],
        p.iptu && ['IPTU', `${brl(p.iptu)}<small>/ano</small>`],
        rent && ['Total mensal estimado', `${brl(p.price + (p.condoFee || 0) + Math.round((p.iptu || 0) / 12))}<small>/mês</small>`]
      ].filter(Boolean);
      $('#pdValues').innerHTML = rows.map(([k, v], i) =>
        `<div class="${rent && i === rows.length - 1 ? 'is-total' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('');

      /* Cartão lateral + barra do celular */
      const closed = isClosed(p);
      $('#cardLabel').textContent = closed ? (p.status === 'vendido' ? 'Imóvel vendido' : 'Imóvel alugado') : (rent ? 'Aluguel mensal' : 'Valor de venda');
      $('#cardPrice').innerHTML = closed ? '<span class="pd-card__closed">Consulte opções semelhantes</span>' : `${fromLabel(p)}${brl(p.price)}${rent ? '<small>/mês</small>' : ''}`;
      $('#cardFees').innerHTML = closed ? '' : [
        p.condoFee && `<li><span>Condomínio</span><b>${brl(p.condoFee)}</b></li>`,
        p.iptu && `<li><span>IPTU/ano</span><b>${brl(p.iptu)}</b></li>`
      ].filter(Boolean).join('');
      $('#headPrice').innerHTML = $('#cardPrice').innerHTML;
      $('#cardCode').textContent = p.code;
      $('#barLabel').textContent = closed ? STATUS[p.status].label : (rent ? 'Aluguel' : (p.priceFrom ? 'A partir de' : 'Valor de venda'));
      $('#barPrice').innerHTML = closed ? '—' : `${brl(p.price)}${rent ? '<small>/mês</small>' : ''}`;
    }
  };

  /* ------------------------------------------------------------------------
     4. GALERIA
     ------------------------------------------------------------------------ */
  const Gallery = {
    init(p) {
      this.el = $('#gallery');
      this.images = p.images.length ? p.images : [{ lg: '', md: '', sm: '', alt: p.title }];
      const n = this.images.length;
      this.el.dataset.count = String(Math.min(n, 5));
      this.el.innerHTML = this.images.map((img, i) => `
        <button class="gallery__item${i >= 5 ? ' is-extra' : ''}" type="button" data-index="${i}" aria-label="Ampliar foto ${i + 1} de ${n}">
          <span class="gallery__media">
            <img src="${esc(i === 0 ? img.lg : img.md)}" alt="${esc(img.alt)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="1600" height="1067">
          </span>
          ${i === 4 && n > 5 ? `<span class="gallery__more">+${n - 5} fotos</span>` : ''}
        </button>`).join('');
      $$('img', this.el).forEach(watchImage);

      $$('.gallery__item', this.el).forEach((btn) =>
        btn.addEventListener('click', () => Lightbox.open(Number(btn.dataset.index))));
      $('#galleryAll').addEventListener('click', () => Lightbox.open(this.current || 0));
      $('#galleryAll span').textContent = `Ver as ${n} fotos`;

      /* Contador no celular (galeria deslizante) */
      this.counter = $('#galleryCounter');
      this.update(0);
      let raf;
      this.el.addEventListener('scroll', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const i = Math.round(this.el.scrollLeft / this.el.clientWidth);
          this.update(Math.max(0, Math.min(n - 1, i)));
        });
      }, { passive: true });
    },
    update(i) {
      this.current = i;
      this.counter.textContent = `${i + 1} / ${this.images.length}`;
    }
  };

  /* ------------------------------------------------------------------------
     5. VISUALIZADOR EM TELA CHEIA
     ------------------------------------------------------------------------ */
  const Lightbox = {
    init(p) {
      this.dialog = $('#lightbox');
      this.img = $('#lbImg');
      this.count = $('#lbCount');
      this.thumbs = $('#lbThumbs');
      this.images = Gallery.images;
      this.index = 0;

      this.thumbs.innerHTML = this.images.map((img, i) => `
        <button class="lightbox__thumb" type="button" role="listitem" data-index="${i}" aria-label="Ver foto ${i + 1}">
          <span class="gallery__media"><img src="${esc(img.sm)}" alt="" loading="lazy" decoding="async" width="160" height="107"></span>
        </button>`).join('');
      $$('img', this.thumbs).forEach(watchImage);
      $$('.lightbox__thumb', this.thumbs).forEach((b) => b.addEventListener('click', () => this.show(Number(b.dataset.index))));

      $('#lbPrev').addEventListener('click', () => this.step(-1));
      $('#lbNext').addEventListener('click', () => this.step(1));
      $('#lbClose').addEventListener('click', () => this.close());
      this.dialog.addEventListener('close', () => document.body.classList.remove('is-locked'));
      this.dialog.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      });
      /* Clique fora da foto fecha */
      this.dialog.addEventListener('click', (e) => { if (e.target === this.dialog || e.target.id === 'lbStage') this.close(); });

      /* Deslizar (toque) */
      let x0 = null;
      const stage = $('#lbStage');
      stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
      stage.addEventListener('pointerup', (e) => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 45) this.step(dx < 0 ? 1 : -1);
      });
      stage.addEventListener('pointercancel', () => { x0 = null; });

      this.img.addEventListener('load', () => this.img.parentElement.classList.remove('is-broken', 'is-waiting'));
      this.img.addEventListener('error', () => this.img.parentElement.classList.add('is-broken'));
    },
    open(i) {
      this.show(i);
      if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
      else this.dialog.setAttribute('open', '');
      document.body.classList.add('is-locked');
      $('#lbNext').focus({ preventScroll: true });
    },
    close() {
      if (typeof this.dialog.close === 'function') this.dialog.close();
      else this.dialog.removeAttribute('open');
      document.body.classList.remove('is-locked');
    },
    step(d) { this.show((this.index + d + this.images.length) % this.images.length); },
    show(i) {
      this.index = i;
      const img = this.images[i];
      const fig = this.img.parentElement;
      fig.classList.remove('is-broken');
      fig.classList.add('is-waiting');
      this.img.src = img.lg;
      this.img.alt = img.alt;
      this.count.textContent = `${i + 1} / ${this.images.length}`;
      $$('.lightbox__thumb', this.thumbs).forEach((b, n) => {
        const on = n === i;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-current', on ? 'true' : 'false');
        if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      });
      /* Pré-carrega a próxima */
      const next = this.images[(i + 1) % this.images.length];
      if (next && next.lg) { const pre = new Image(); pre.src = next.lg; }
    }
  };

  /* ------------------------------------------------------------------------
     6. CONTATO
     ------------------------------------------------------------------------ */
  const Contact = {
    init(p) {
      const url = `${location.origin}${location.pathname}?id=${p.id}`;
      const interest = `Olá! Tenho interesse no imóvel "${p.title}" (${p.code}) em ${p.neighborhood}, ${p.city}.\n${url}`;
      const visit = `Olá! Gostaria de agendar uma visita ao imóvel "${p.title}" (${p.code}).\n${url}`;
      const similar = `Olá! Vi o imóvel "${p.title}" (${p.code}) e gostaria de conhecer opções semelhantes.\n${url}`;
      const main = isClosed(p) ? similar : interest;

      $('#ctaWhats').href = waLink(main);
      $('#barWhats').href = waLink(main);
      $('#ctaVisit').href = waLink(visit);
      if (isClosed(p)) {
        $('#ctaVisit').hidden = true;
        $('#ctaWhats').lastChild.textContent = ' Ver opções semelhantes';
        $('#barWhats').lastChild.textContent = ' Opções semelhantes';
      }
      $$('[data-wa]').forEach((a) => { a.href = waLink(interest); });

      $('#ctaPhone').href = `tel:${CONTACT.phone}`;
      $('#ctaPhone span').textContent = CONTACT.phoneLabel;

      $('#ctaShare').addEventListener('click', async () => {
        const data = { title: p.title, text: `${p.title} — ${p.neighborhood}, ${p.city}`, url };
        if (navigator.share) {
          try { await navigator.share(data); } catch (e) { /* cancelado */ }
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copiado!');
        } catch (e) {
          window.prompt('Copie o link do imóvel:', url);
        }
      });
    }
  };

  /* ------------------------------------------------------------------------
     7. MAPA — só carrega o Google Maps se o visitante pedir
     (evita cookies de terceiros e deixa a página mais leve)
     ------------------------------------------------------------------------ */
  const MapBlock = {
    init(p) {
      const exact = p.lat && p.lng;
      const query = exact ? `${p.lat},${p.lng}` : [p.neighborhood, p.city, p.state, 'Brasil'].filter(Boolean).join(', ');
      $('#pdMapText').innerHTML = exact && p.address
        ? `${esc(p.address)} — ${esc(p.neighborhood)}, ${esc(p.city)}`
        : `${esc(p.neighborhood)}, ${esc(p.city)}${p.state ? ` — ${esc(p.state)}` : ''}. <span>O endereço exato é informado pelo consultor no agendamento da visita.</span>`;

      $('#pdMapLoad').addEventListener('click', () => {
        const frame = document.createElement('iframe');
        frame.title = `Mapa: ${p.neighborhood}, ${p.city}`;
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer-when-downgrade';
        frame.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${exact ? 16 : 14}&output=embed`;
        const box = $('#pdMap');
        box.innerHTML = '';
        box.classList.add('is-loaded');
        box.appendChild(frame);
      }, { once: true });
    }
  };

  /* ------------------------------------------------------------------------
     8. SEMELHANTES
     ------------------------------------------------------------------------ */
  const cardTemplate = (p) => {
    const title = esc(p.title);
    const zone = zoneLabel(p.zone);
    const loc = esc(zone ? `${p.neighborhood} · ${zone}` : [p.neighborhood, p.city].filter(Boolean).join(' — '));
    const rent = p.purpose === 'aluguel';
    return `
      <article class="pcard">
        <div class="pcard__media">
          <img src="${esc(p.image)}" alt="${title} em ${loc}" loading="lazy" decoding="async" width="1200" height="900">
          <div class="pcard__shade"></div>
        </div>
        ${rent ? '<div class="pcard__tags"><span class="tag">Aluguel</span></div>' : ''}
        <span class="pcard__go" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-arrow-up-right"/></svg></span>
        <div class="pcard__body">
          <p class="pcard__kicker">${esc(p.type)}</p>
          <h3 class="pcard__title">${title}</h3>
          <p class="pcard__loc"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg>${loc}</p>
          <p class="pcard__price">${p.priceFrom ? '<span class="pcard__from">A partir de</span>' : ''}${brl(p.price)}${rent ? '<small>/mês</small>' : ''}</p>
          <ul class="pcard__meta" aria-label="Características">
            <li><svg class="icon" aria-hidden="true"><use href="#i-bed"/></svg>${plural(p.bedrooms, 'quarto', 'quartos')}</li>
            <li><svg class="icon" aria-hidden="true"><use href="#i-bath"/></svg>${plural(p.bathrooms, 'banheiro', 'banheiros')}</li>
            <li><svg class="icon" aria-hidden="true"><use href="#i-car"/></svg>${plural(p.parking, 'vaga', 'vagas')}</li>
            <li><svg class="icon" aria-hidden="true"><use href="#i-area"/></svg>${p.area} m²</li>
          </ul>
          <span class="pcard__cta">Ver imóvel <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></span>
        </div>
        <a class="pcard__link" href="imovel.html?id=${p.id}" aria-label="Ver imóvel: ${title}, ${loc}, ${p.priceFrom ? 'a partir de ' : ''}${brl(p.price)}"></a>
      </article>`;
  };

  const Similar = {
    async init(p) {
      try {
        const list = await fetchSimilar(p, 4);
        if (!list.length) return;
        const grid = $('#similarGrid');
        grid.innerHTML = list.map(cardTemplate).join('');
        $$('.pcard__media img', grid).forEach(watchImage);
        $('#similar').hidden = false;
      } catch (e) { /* seção opcional */ }
    }
  };

  /* ------------------------------------------------------------------------
     INICIALIZAÇÃO
     ------------------------------------------------------------------------ */
  const init = () => {
    Header.init();
    const year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
    Page.init();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
