/* ==========================================================================
   RIVALDO DUARTE — data.js
   Fonte de dados do site (Home + página do imóvel).
   Tudo vem do painel administrativo pela API pública (somente leitura):
     api/public/properties.php  → lista de imóveis publicados
     api/public/property.php    → detalhe de um imóvel
   ========================================================================== */

window.RivaldoData = (() => {
  'use strict';

  const API_BASE = 'api/public/';
  const PAGE_LIMIT = 100;   // máximo aceito pela API por página
  const MAX_PAGES = 5;      // até 500 imóveis na Home

  /* Contatos usados nos botões */
  const CONTACT = {
    whatsapp: '5511958346101',
    phone: '+5511958346101',
    phoneLabel: '(11) 95834-6101',
    email: ''   // adicionar quando o e-mail de contato existir
  };

  /* Zonas de São Paulo — mesma ordem e códigos do painel (Bairros / localidades) */
  const ZONES = [
    { value: 'sul', label: 'Zona Sul' },
    { value: 'oeste', label: 'Zona Oeste' },
    { value: 'norte', label: 'Zona Norte' },
    { value: 'leste', label: 'Zona Leste' },
    { value: 'centro', label: 'Centro' }
  ];
  const zoneLabel = (z) => (ZONES.find((x) => x.value === z) || {}).label || '';

  /* ------------------------------------------------------------------------
     API → formato usado pelas páginas
     ------------------------------------------------------------------------ */
  const nameOf = (v) => (v && typeof v === 'object' ? v.name : v) || '';

  const fromApi = (d) => {
    const images = (d.images || []).filter((i) => i.urls).map((i, n) => ({
      lg: i.urls.lg, md: i.urls.md, sm: i.urls.sm,
      alt: i.alt_text || `${d.title} — foto ${n + 1}`
    }));
    const cover = d.cover || (images[0] ? { md: images[0].md } : null);
    return {
      id: d.id,
      code: d.code,
      title: d.title,
      type: nameOf(d.type),
      purpose: d.transaction_type,
      status: d.status,
      city: nameOf(d.city),
      state: d.state || (d.city && d.city.state) || '',
      neighborhood: nameOf(d.neighborhood),
      zone: (d.neighborhood && typeof d.neighborhood === 'object' ? d.neighborhood.zone : d.zone) || '',
      price: Number(d.price) || 0,
      priceFrom: Boolean(d.price_from),
      condoFee: d.condominium_fee,
      iptu: d.property_tax,
      area: Number(d.usable_area || d.total_area) || 0,
      totalArea: d.usable_area && d.total_area && d.total_area !== d.usable_area ? d.total_area : null,
      bedrooms: d.bedrooms || 0,
      suites: d.suites || 0,
      bathrooms: d.bathrooms || 0,
      parking: d.parking_spaces || 0,
      description: d.description || '',
      features: (d.features || []).map((f) => f.name),
      images,
      image: cover ? cover.md : '',
      featured: Boolean(d.featured),
      createdAt: d.created_at || '',
      address: d.address ? [d.address, d.number].filter(Boolean).join(', ') : null,
      lat: d.latitude,
      lng: d.longitude
    };
  };

  const getJSON = async (path, params = {}) => {
    const url = new URL(API_BASE + path, document.baseURI);
    Object.entries(params).forEach(([k, v]) => v != null && v !== '' && url.searchParams.set(k, v));
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Erro ao carregar');
    return json.data;
  };

  /* ------------------------------------------------------------------------
     HOME — carrega os imóveis publicados uma vez e filtra no navegador
     ------------------------------------------------------------------------ */
  let cache = [];
  let loading = null;

  const PropertyService = {
    /** Busca os imóveis publicados (chame antes de usar getAll/getFeatured). */
    load() {
      if (!loading) {
        loading = (async () => {
          const all = [];
          for (let page = 1; page <= MAX_PAGES; page++) {
            const data = await getJSON('properties.php', { limit: PAGE_LIMIT, page });
            const items = data && data.items ? data.items : [];
            all.push(...items.map(fromApi));
            const pages = data && data.meta ? Number(data.meta.pages) || 1 : 1;
            if (!items.length || page >= pages) break;
          }
          cache = all;
          return cache;
        })().catch((err) => {
          console.error('[Rivaldo] Não foi possível carregar os imóveis:', err);
          cache = [];
          return cache;
        });
      }
      return loading;
    },
    getAll: () => cache,
    /** Carrossel: destaques disponíveis */
    getFeatured: () => cache.filter((p) => p.featured && p.status === 'disponivel'),
    getById: (id) => cache.find((p) => p.id === Number(id))
  };

  /* ------------------------------------------------------------------------
     PÁGINA DO IMÓVEL
     ------------------------------------------------------------------------ */
  /** Detalhe completo (null se não existir / não publicado) */
  const fetchProperty = async (id) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return null;
    const d = await getJSON('property.php', { id: n });
    return d ? fromApi(d) : null;
  };

  /** Até `limit` imóveis parecidos (mesma finalidade; prioriza zona/bairro/tipo/preço) */
  const fetchSimilar = async (base, limit = 4) => {
    const data = await getJSON('properties.php', { transaction_type: base.purpose, limit: 24 });
    const list = (data && data.items ? data.items : []).map(fromApi);
    const score = (p) =>
      (p.zone && p.zone === base.zone ? 3 : 0) +
      (p.type === base.type ? 2 : 0) +
      (p.neighborhood === base.neighborhood ? 2 : 0) +
      (p.city === base.city ? 1 : 0) -
      Math.abs(Math.log((p.price || 1) / (base.price || 1)));
    return list
      .filter((p) => p.id !== base.id && p.purpose === base.purpose)
      .sort((a, b) => score(b) - score(a))
      .slice(0, limit);
  };

  return { CONTACT, ZONES, zoneLabel, PropertyService, fetchProperty, fetchSimilar };
})();
