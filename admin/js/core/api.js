/**
 * Cliente da API do painel.
 * - Envia cookies de sessão (same-origin) e o token CSRF em toda escrita.
 * - Padroniza erros em ApiError { status, message, errors }.
 * - 401 → volta para o login. 403 com errors.csrf → renova o token e tenta de novo (1x).
 */

const API_BASE = new URL('../api/', window.location.href);
const TIMEOUT_MS = 30000;

let csrfToken = null;

export class ApiError extends Error {
  constructor(status, message, errors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors || {};
  }
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

/** Leva ao login preservando a página atual (só caminhos internos). */
export function redirectToLogin(reason = '') {
  const here = window.location.pathname.split('/').pop() + window.location.search;
  const params = new URLSearchParams();
  if (here && !here.startsWith('login.html')) params.set('next', here);
  if (reason) params.set('motivo', reason);
  window.location.replace(`login.html${params.toString() ? `?${params}` : ''}`);
}

async function send(path, { method = 'GET', body, query, retry = true, skipAuthRedirect = false } = {}) {
  const url = new URL(path, API_BASE);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }

  const headers = { Accept: 'application/json', 'X-Requested-With': 'fetch' };
  const isWrite = method !== 'GET';
  if (isWrite && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let payload;
  if (body instanceof FormData) {
    payload = body; // o navegador define o multipart/boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    const offline = !navigator.onLine;
    throw new ApiError(0, offline
      ? 'Você está sem internet. Verifique a conexão e tente novamente.'
      : err.name === 'AbortError'
        ? 'O servidor demorou para responder. Tente novamente.'
        : 'Não foi possível conectar ao servidor.');
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    /* resposta sem JSON (erro do servidor/hospedagem) */
  }

  if (response.ok && json && json.success) {
    return json;
  }

  const message = json?.message || 'Ocorreu um erro inesperado. Tente novamente.';

  if (response.status === 401 && !skipAuthRedirect) {
    // "Expirada" quando o servidor avisa ou quando a sessão cai no meio do uso.
    const expired = json?.errors?.session === 'expired' || path !== 'auth/me.php';
    redirectToLogin(expired ? 'expirada' : '');
    throw new ApiError(401, message);
  }

  // Primeiro acesso sem a senha pessoal criada → tela de criação de senha.
  if (response.status === 403 && json?.errors?.password_change === 'required') {
    window.location.replace('trocar-senha.html');
    throw new ApiError(403, message, json.errors);
  }

  // Token CSRF desatualizado (ex.: aba antiga): renova e repete uma vez.
  if (response.status === 403 && json?.errors?.csrf && retry) {
    const me = await send('auth/me.php', { retry: false });
    setCsrfToken(me.data.csrf_token);
    return send(path, { method, body, query, retry: false, skipAuthRedirect });
  }

  throw new ApiError(response.status, message, json?.errors);
}

export const api = {
  get: (path, query, options = {}) => send(path, { ...options, query }),
  post: (path, body, options = {}) => send(path, { ...options, method: 'POST', body }),
  upload: (path, formData, options = {}) => send(path, { ...options, method: 'POST', body: formData }),
};

/**
 * Upload com barra de progresso (fetch não informa progresso de envio).
 * onProgress(0..1). Mesmo tratamento de erros (401, CSRF) do restante da API.
 */
export function uploadWithProgress(path, formData, onProgress, retry = true) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', new URL(path, API_BASE));
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.timeout = 120000;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Requested-With', 'fetch');
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);

    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onerror = () => reject(new ApiError(0, navigator.onLine ? 'Falha na conexão durante o envio.' : 'Você está sem internet.'));
    xhr.ontimeout = () => reject(new ApiError(0, 'O envio demorou demais. Tente com menos fotos por vez.'));
    xhr.onload = async () => {
      const json = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && json?.success) { resolve(json); return; }
      if (xhr.status === 401) { redirectToLogin('expirada'); reject(new ApiError(401, json?.message || '')); return; }
      if (xhr.status === 403 && json?.errors?.csrf && retry) {
        try {
          const me = await api.get('auth/me.php');
          setCsrfToken(me.data.csrf_token);
          resolve(await uploadWithProgress(path, formData, onProgress, false));
        } catch (err) { reject(err); }
        return;
      }
      if (xhr.status === 413) { reject(new ApiError(413, 'Arquivo grande demais para o servidor.')); return; }
      reject(new ApiError(xhr.status, json?.message || 'Não foi possível enviar a imagem.', json?.errors));
    };
    xhr.send(formData);
  });
}
