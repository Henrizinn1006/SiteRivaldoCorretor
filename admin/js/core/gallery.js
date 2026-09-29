/**
 * Galeria de fotos do imóvel:
 * upload múltiplo (arrastar arquivos, galeria do celular ou câmera), progresso,
 * foto de capa, exclusão e reordenação (arrastar pela alça OU botões ← →).
 */
import { api, uploadWithProgress } from './api.js';
import { icon } from './icons.js';
import { toast, confirmDialog, emptyState } from './ui.js';
import { escapeHTML } from './format.js';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;
const RESIZE_OVER = 2560;          // reduz no aparelho antes de enviar (economiza dados no celular)

export class Gallery {
  /**
   * @param {HTMLElement} root
   * @param {{ getPropertyId: () => number|null, ensureSaved: () => Promise<number|null>, onChange?: (images) => void }} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.images = [];
    this.coverId = null;
    this.busy = false;
    this.renderShell();
    this.bind();
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="dropzone" id="dropzone">
        ${icon('photo')}
        <p class="dropzone__title">Arraste as fotos para cá</p>
        <p class="dropzone__text">JPG, PNG ou WEBP · até 10 MB cada · até 40 fotos. A primeira (ou a escolhida) é a capa.</p>
        <div class="dropzone__actions">
          <label class="btn btn--gold">
            ${icon('upload')}<span>Escolher fotos</span>
            <input class="sr-only" type="file" id="galleryInput" accept="image/jpeg,image/png,image/webp" multiple>
          </label>
          <label class="btn btn--outline camera-btn">
            ${icon('camera')}<span>Tirar foto</span>
            <input class="sr-only" type="file" id="cameraInput" accept="image/*" capture="environment">
          </label>
        </div>
      </div>
      <div class="upload-list" id="uploadList" aria-live="polite"></div>
      <p class="form-hint" id="galleryHint">Para reordenar, arraste pela alça ${icon('grip')} ou use as setas. A ordem é salva automaticamente.</p>
      <div class="gallery" id="galleryGrid"></div>`;
    this.grid = this.root.querySelector('#galleryGrid');
    this.uploadList = this.root.querySelector('#uploadList');
    this.dropzone = this.root.querySelector('#dropzone');
  }

  bind() {
    this.root.querySelector('#galleryInput').addEventListener('change', (e) => { this.handleFiles(e.target.files); e.target.value = ''; });
    this.root.querySelector('#cameraInput').addEventListener('change', (e) => { this.handleFiles(e.target.files); e.target.value = ''; });

    ['dragenter', 'dragover'].forEach((type) => this.dropzone.addEventListener(type, (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      this.dropzone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((type) => this.dropzone.addEventListener(type, () => this.dropzone.classList.remove('is-over')));
    this.dropzone.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      this.handleFiles(e.dataTransfer.files);
    });

    this.grid.addEventListener('click', (e) => {
      const item = e.target.closest('.gallery__item');
      if (!item) return;
      const id = Number(item.dataset.id);
      if (e.target.closest('[data-cover]')) this.setCover(id);
      else if (e.target.closest('[data-delete]')) this.remove(id);
      else if (e.target.closest('[data-left]')) this.move(id, -1);
      else if (e.target.closest('[data-right]')) this.move(id, 1);
    });

    this.grid.addEventListener('keydown', (e) => {
      const handle = e.target.closest('.gallery__handle');
      if (!handle) return;
      const id = Number(handle.closest('.gallery__item').dataset.id);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.move(id, -1, true); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.move(id, 1, true); }
    });

    this.grid.addEventListener('pointerdown', (e) => this.startDrag(e));
  }

  setImages(images, coverId) {
    this.images = images || [];
    this.coverId = coverId ?? this.images.find((i) => i.is_cover)?.id ?? this.images[0]?.id ?? null;
    this.render();
    this.opts.onChange?.(this.images);
  }

  render() {
    if (!this.images.length) {
      this.grid.innerHTML = `<div class="gallery__empty">${emptyState({ iconName: 'photo', title: 'Nenhuma foto ainda.', text: 'Imóveis com boas fotos recebem muito mais contatos.' })}</div>`;
      return;
    }
    const last = this.images.length - 1;
    this.grid.innerHTML = this.images.map((img, i) => {
      const cover = img.id === this.coverId;
      return `
        <figure class="gallery__item${cover ? ' is-cover' : ''}" data-id="${img.id}">
          <img src="../${escapeHTML(img.urls.sm)}" alt="Foto ${i + 1}" loading="lazy" draggable="false" width="400" height="300">
          ${cover ? '<span class="gallery__badge">Capa</span>' : ''}
          <button class="gallery__handle" type="button" aria-label="Reordenar foto ${i + 1} (use as setas)" title="Arraste para reordenar">${icon('grip')}</button>
          <span class="gallery__pos" aria-hidden="true">${i + 1}</span>
          <div class="gallery__bar">
            <button class="icon-btn" type="button" data-left ${i === 0 ? 'disabled' : ''} aria-label="Mover foto ${i + 1} para antes">${icon('chevronLeft')}</button>
            <button class="cover-btn" type="button" data-cover ${cover ? 'aria-current="true"' : ''}>${cover ? 'Foto de capa' : 'Definir capa'}</button>
            <button class="icon-btn" type="button" data-right ${i === last ? 'disabled' : ''} aria-label="Mover foto ${i + 1} para depois">${icon('chevronRight')}</button>
            <button class="icon-btn" type="button" data-delete aria-label="Excluir foto ${i + 1}">${icon('trash')}</button>
          </div>
        </figure>`;
    }).join('');
  }

  apply(res, message) {
    this.setImages(res.data.images, res.data.cover_image_id);
    if (message !== false) toast(message || res.message);
  }

  /* ------------------------------------------------------------ Upload */

  async handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length || this.busy) return;

    const propertyId = this.opts.getPropertyId() || await this.opts.ensureSaved();
    if (!propertyId) return;

    this.busy = true;
    let sent = 0;
    for (const original of files) {
      const line = document.createElement('div');
      line.className = 'upload-item';
      line.innerHTML = `<span>${escapeHTML(original.name || 'foto')}</span><span data-pct>0%</span><div class="upload-item__bar"><span></span></div>`;
      this.uploadList.append(line);
      const bar = line.querySelector('.upload-item__bar span');
      const pct = line.querySelector('[data-pct]');

      try {
        if (original.type && !ACCEPT.includes(original.type) && !original.type.startsWith('image/')) {
          throw new Error('Formato não permitido. Envie JPG, PNG ou WEBP.');
        }
        pct.textContent = 'preparando…';
        const file = await prepare(original);
        if (file.size > MAX_BYTES) throw new Error('Cada imagem pode ter no máximo 10 MB.');

        const form = new FormData();
        form.append('property_id', String(propertyId));
        form.append('files[]', file, file.name);
        const res = await uploadWithProgress('properties/images/upload.php', form, (p) => {
          bar.style.width = `${Math.round(p * 100)}%`;
          pct.textContent = p < 1 ? `${Math.round(p * 100)}%` : 'otimizando…';
        });
        bar.style.width = '100%';
        pct.textContent = 'enviada';
        this.setImages(res.data.images, res.data.cover_image_id);
        sent++;
        setTimeout(() => line.remove(), 1500);
      } catch (err) {
        if (err.status === 401) return;
        line.classList.add('is-error');
        pct.textContent = 'erro';
        line.insertAdjacentHTML('beforeend', `<span style="grid-column:1/-1">${escapeHTML(err.message)}</span>`);
        setTimeout(() => line.remove(), 9000);
      }
    }
    this.busy = false;
    if (sent) toast(sent === 1 ? 'Imagem enviada.' : `${sent} imagens enviadas.`);
  }

  /* ------------------------------------------------------------ Ações */

  async setCover(id) {
    try {
      this.apply(await api.post('properties/images/cover.php', { property_id: this.opts.getPropertyId(), image_id: id }));
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'error');
    }
  }

  async remove(id) {
    const ok = await confirmDialog({ title: 'Excluir foto?', text: 'A foto será apagada do servidor. Esta ação não pode ser desfeita.', confirmText: 'Excluir foto', danger: true });
    if (!ok) return;
    try {
      this.apply(await api.post('properties/images/delete.php', { id }));
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'error');
    }
  }

  async move(id, delta, keepFocus = false) {
    const i = this.images.findIndex((img) => img.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.images.length) return;
    const order = this.images.map((img) => img.id);
    [order[i], order[j]] = [order[j], order[i]];
    await this.saveOrder(order);
    if (keepFocus) this.grid.querySelector(`[data-id="${id}"] .gallery__handle`)?.focus();
  }

  async saveOrder(order) {
    // Atualiza na hora (otimista) e confirma no servidor
    const previous = this.images;
    this.images = order.map((id) => previous.find((img) => img.id === id));
    this.render();
    try {
      const res = await api.post('properties/images/reorder.php', { property_id: this.opts.getPropertyId(), order });
      this.setImages(res.data.images, res.data.cover_image_id);
    } catch (err) {
      this.images = previous;
      this.render();
      if (err.status !== 401) toast(err.message, 'error');
    }
  }

  /* ------------------------------------------- Arrastar (mouse e toque) */

  startDrag(e) {
    const handle = e.target.closest('.gallery__handle');
    if (!handle || e.button > 0) return;
    const item = handle.closest('.gallery__item');
    e.preventDefault();

    const rect = item.getBoundingClientRect();
    const ghost = item.cloneNode(true);
    ghost.classList.add('is-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);
    item.classList.add('is-dragging');

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startOrder = this.images.map((img) => img.id).join(',');

    const onMove = (ev) => {
      ghost.style.left = `${ev.clientX - offsetX}px`;
      ghost.style.top = `${ev.clientY - offsetY}px`;
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.gallery__item');
      if (!target || target === item || !this.grid.contains(target)) return;
      const r = target.getBoundingClientRect();
      const after = ev.clientX > r.left + r.width / 2;
      target.parentNode.insertBefore(item, after ? target.nextSibling : target);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      ghost.remove();
      item.classList.remove('is-dragging');
      const order = [...this.grid.querySelectorAll('.gallery__item')].map((el) => Number(el.dataset.id));
      if (order.join(',') !== startOrder) this.saveOrder(order);
      else this.render();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
}

/** Reduz fotos muito grandes no próprio aparelho (mantém a rotação da câmera). */
async function prepare(file) {
  if (!('createImageBitmap' in window) || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    if (Math.max(width, height) <= RESIZE_OVER && file.size <= 3 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const scale = Math.min(1, RESIZE_OVER / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (!blob) return file;
    const name = (file.name || 'foto').replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], name, { type });
  } catch {
    return file; // o servidor valida e otimiza de qualquer forma
  }
}
