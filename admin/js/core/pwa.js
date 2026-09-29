/**
 * PWA: registro do Service Worker e botão "Instalar aplicativo".
 * O Service Worker NUNCA guarda respostas da API (dados administrativos).
 */

import { viewModal } from './ui.js';

let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function canInstall() {
  return window.isSecureContext && !installed && !isStandalone() && (isIOS() || Boolean(deferredPrompt));
}

function notify() {
  listeners.forEach((fn) => fn(canInstall()));
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();          // mostramos nosso próprio botão
  deferredPrompt = e;
  notify();
});

window.addEventListener('appinstalled', () => {
  installed = true;
  deferredPrompt = null;
  notify();
});

window.matchMedia('(display-mode: standalone)').addEventListener('change', notify);
window.addEventListener('pageshow', notify);

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(() => {
      /* sem SW o painel continua funcionando normalmente */
    });
  }, { once: true });
}

export function onInstallAvailable(fn) {
  listeners.add(fn);
  fn(canInstall());
}

export async function promptInstall() {
  if (!canInstall()) return;
  if (isIOS()) {
    viewModal({
      title: 'Instalar no iPhone ou iPad',
      size: '',
      body: `<p>Abra este painel no <strong>Safari</strong>. Se estiver no Instagram ou WhatsApp, copie o endereço e abra no Safari.</p>
        <ol class="pwa-install-steps">
          <li>Toque em <strong>Compartilhar</strong> (quadrado com uma seta para cima). Dependendo da versão, fica dentro do menu <strong>Mais (…)</strong>.</li>
          <li>Selecione <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Se aparecer <strong>Abrir como App da Web</strong>, deixe ativado. Depois toque em <strong>Adicionar</strong>.</li>
        </ol>
        <p>Não encontrou a opção? No menu de compartilhamento, role até <strong>Editar Ações</strong> e adicione <strong>Adicionar à Tela de Início</strong>.</p>`,
    });
    return;
  }
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(() => null);
  deferredPrompt = null;
  notify();
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
