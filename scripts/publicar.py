#!/usr/bin/env python3
"""
Monta o pacote de publicação do site: _publicar/rivaldo-site.zip

  python scripts/publicar.py          (rodar na pasta LandingPage)

O que ele faz:
  1. Copia SÓ os arquivos que vão para o servidor (lista fixa abaixo).
     Nunca entram: .env, install/, scripts/, database/, docs/, README,
     _to_delete/, _publicar/, fotos originais e outros arquivos de trabalho.
  2. Coloca uma VERSÃO em cada CSS, JS e imagem (ex.: css/style.css?v=3f9a1c2e).
     A versão vem do conteúdo do arquivo: mudou o arquivo → muda o endereço →
     CDN e navegadores buscam o novo sozinhos. NÃO precisa limpar cache.
     Arquivo que não mudou mantém o endereço e continua aproveitando o cache.
  3. Painel (PWA): o Service Worker recebe uma versão nova automaticamente
     sempre que qualquer arquivo do painel muda.

Os arquivos da pasta LandingPage NÃO são alterados — as versões só existem no zip.
Só usa a biblioteca padrão do Python (3.8+).
"""
from __future__ import annotations

import hashlib
import io
import posixpath
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # pasta LandingPage
OUT = ROOT / '_publicar' / 'rivaldo-site.zip'

# ---------------------------------------------------------------- o que vai
INCLUDE_FILES = [
    'index.html', 'imovel.html', 'favicon.ico', '.htaccess',
    'config/config.php', 'config/.htaccess',
    'uploads/.htaccess', 'uploads/properties/.gitkeep',
]
INCLUDE_DIRS = ['css', 'js', 'admin', 'api', 'app', 'assets']

# Nunca publicar (mesmo que estejam dentro das pastas acima)
EXCLUDE = [
    re.compile(r'(^|/)\.env(\..*)?$'),                  # .env, .env.qualquer
    re.compile(r'(^|/)\.git(/|ignore$)'),
    re.compile(r'\.(sql|md|log|bak|old|swp|zip|psd|ai|tmp)$', re.I),
    re.compile(r'(^|/)(Thumbs\.db|\.DS_Store|desktop\.ini)$', re.I),
    re.compile(r'^assets/videos/'),
    re.compile(r'^assets/images/(assinatura\.png|favicon\.png|imovel-luxo\.png|foto .*|hero-imovel.*)$'),
    re.compile(r'\.example\.php$'),
]

VERSIONED_EXT = {'.css', '.js', '.webp', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif', '.avif', '.woff', '.woff2'}
NEVER_VERSION = {'admin/service-worker.js', 'admin/manifest.json'}   # endereços fixos (PWA)


def excluded(rel: str) -> bool:
    return any(p.search(rel) for p in EXCLUDE)


def collect() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for rel in INCLUDE_FILES:
        p = ROOT / rel
        if not p.is_file():
            sys.exit(f'Arquivo obrigatório não encontrado: {rel}')
        files[rel] = p.read_bytes()
    for d in INCLUDE_DIRS:
        for p in sorted((ROOT / d).rglob('*')):
            if p.is_file():
                rel = p.relative_to(ROOT).as_posix()
                if not excluded(rel):
                    files[rel] = p.read_bytes()
    return files


# ---------------------------------------------------------------- versões
REF_HTML = re.compile(r'''(\b(?:href|src|srcset|poster)\s*=\s*")([^"]+)(")''')
REF_CSS = re.compile(r'''(url\(\s*["']?)([^"')]+)(["']?\s*\))''')
REF_JS_IMPORT = re.compile(r'''(\bfrom\s*["']|\bimport\s*\(\s*["']|\bimport\s*["'])(\.{1,2}/[^"']+\.js)(["'])''')
REF_SW_SHELL = re.compile(r'''(["'])(\.{1,2}/[^"']+)(["'])''')


class Builder:
    def __init__(self, files: dict[str, bytes]):
        self.files = files
        self.out: dict[str, bytes] = {}
        self.hash: dict[str, str] = {}
        self.stack: set[str] = set()

    @staticmethod
    def short(data: bytes) -> str:
        return hashlib.md5(data).hexdigest()[:8]

    def resolve(self, base: str, ref: str) -> str | None:
        """Caminho do arquivo referenciado (relativo à raiz do site) ou None se não for local."""
        if re.match(r'^(?:[a-z]+:|//|#|data:|mailto:|tel:)', ref, re.I) or '?' in ref or '${' in ref:
            return None
        path = posixpath.normpath(posixpath.join(posixpath.dirname(base), ref.split('#')[0]))
        return path if path in self.files else None

    def versioned(self, base: str, ref: str) -> str:
        target = self.resolve(base, ref)
        if not target or target in NEVER_VERSION or Path(target).suffix.lower() not in VERSIONED_EXT:
            return ref
        return f'{ref}?v={self.version(target)}'

    def version(self, rel: str) -> str:
        """Versão = hash do arquivo JÁ reescrito (dependências primeiro)."""
        if rel not in self.hash:
            self.build(rel)
            self.hash[rel] = self.short(self.out[rel])
        return self.hash[rel]

    def build(self, rel: str) -> None:
        if rel in self.out:
            return
        if rel in self.stack:                       # dependência circular: publica sem versão
            self.out[rel] = self.files[rel]
            return
        self.stack.add(rel)
        data = self.files[rel]
        ext = Path(rel).suffix.lower()
        if ext == '.css':
            text = data.decode('utf-8')
            text = REF_CSS.sub(lambda m: m.group(1) + self.versioned(rel, m.group(2).strip()) + m.group(3), text)
            data = text.encode('utf-8')
        elif ext == '.js' and rel.startswith('admin/js/'):
            text = data.decode('utf-8')
            text = REF_JS_IMPORT.sub(lambda m: m.group(1) + self.versioned(rel, m.group(2)) + m.group(3), text)
            data = text.encode('utf-8')
        elif ext == '.html':
            text = data.decode('utf-8')

            def repl(m: re.Match) -> str:
                value = m.group(2)
                if m.group(1).lower().startswith('srcset'):
                    parts = [p.strip() for p in value.split(',')]
                    value = ', '.join(' '.join([self.versioned(rel, p.split()[0])] + p.split()[1:]) for p in parts if p)
                else:
                    value = self.versioned(rel, value)
                return m.group(1) + value + m.group(3)

            data = REF_HTML.sub(repl, text).encode('utf-8')
        self.out[rel] = data
        self.stack.discard(rel)

    def service_worker(self) -> None:
        rel = 'admin/service-worker.js'
        if rel not in self.files:
            return
        text = self.files[rel].decode('utf-8')
        text = REF_SW_SHELL.sub(lambda m: m.group(1) + self.versioned(rel, m.group(2)) + m.group(3), text)
        admin = hashlib.md5()
        for name in sorted(k for k in self.out if k.startswith('admin/') and k != rel):
            admin.update(name.encode() + self.out[name])
        text, n = re.subn(r"const CACHE_VERSION = '[^']*';", f"const CACHE_VERSION = 'rv-admin-{admin.hexdigest()[:8]}';", text)
        if n != 1:
            sys.exit('service-worker.js: não achei CACHE_VERSION')
        self.out[rel] = text.encode('utf-8')

    def run(self) -> dict[str, bytes]:
        for rel in self.files:
            if rel != 'admin/service-worker.js':
                self.build(rel)
        self.service_worker()
        return self.out


# ---------------------------------------------------------------- zip
def main() -> None:
    files = collect()
    for rel in files:                                   # dupla checagem de segurança
        if excluded(rel) or rel.startswith(('install/', 'scripts/', 'database/', 'docs/', '_')):
            sys.exit(f'Arquivo proibido no pacote: {rel}')
    out = Builder(files).run()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in sorted(out):
            z.writestr(rel, out[rel])
    OUT.parent.mkdir(exist_ok=True)
    tmp = Path(tempfile.gettempdir()) / 'rivaldo-site.zip'
    tmp.write_bytes(buf.getvalue())
    shutil.copyfile(tmp, OUT)                            # sobrescreve sem apagar/renomear

    changed = sum(1 for k in out if out[k] != files[k])
    print(f'OK: {OUT.relative_to(ROOT)} · {len(out)} arquivos · {len(buf.getvalue()) // 1024} KB · {changed} com versão aplicada')


if __name__ == '__main__':
    main()
