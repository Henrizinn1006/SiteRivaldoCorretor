# Arquitetura — Site + Painel Administrativo

> Documento técnico de referência (Vortexis). Atualizar a cada fase.

---

## 1. Análise do projeto existente

| Item | Situação atual |
|---|---|
| `index.html` | Home completa (hero animado, busca, carrossel, grid, diferenciais, CTA, footer). |
| `css/style.css` | ~1.600 linhas, tokens em `:root`, organizado por seções. |
| `js/main.js` | Módulos em IIFE: dados, `PropertyService`, templates, header, fundo do hero (WebGL), busca, grid, carrossel, reveal. |
| Dados | Array fictício `properties` dentro do `main.js`, acessado **somente** via `PropertyService` (`getAll`, `getFeatured`, `getById`). |
| Contatos | WhatsApp, telefone, e-mail e CRECI **fixos no HTML** (6 ocorrências). |
| Assets | `assets/images` (hero, máscara WebGL, mármore), `assets/videos` (vazio). |

**Pontos favoráveis para a integração:**
- O `PropertyService` já isola a origem dos dados → na Fase 6 basta trocar a implementação por `fetch()` sem mexer em templates, carrossel ou grid.
- Os filtros já usam chaves equivalentes às da API (`purpose`, `type`, `city`, `neighborhood`, `price`, `bedrooms`, `parking`).
- Os cards já apontam para `imovel.html?id=`.

**O que precisará mudar na Home (Fase 6):**
- `PropertyService` → assíncrono, consumindo `/api/public/...`.
- Opções de tipo/cidade/bairro vindas da API (hoje derivadas do array).
- Contatos/redes sociais preenchidos a partir de `/api/public/settings.php` (atributos `data-setting`).
- Mapeamento de campos: `purpose→transaction_type`, `parking→parking_spaces`, `area→usable_area`, `image→cover.card`.

---

## 2. Árvore de arquivos

```
/                               ← raiz pública (public_html)
├── index.html                  Home (existente)
├── imovel.html                 Detalhe do imóvel (Fase 6)
├── css/  js/  assets/          Site público (existente)
├── .htaccess                   Segurança básica + sem listagem
│
├── admin/                      Painel (PWA)
│   ├── login.html
│   ├── index.html              Dashboard
│   ├── imoveis.html            (Fase 2)
│   ├── imovel-form.html        (Fase 2/3)
│   ├── categorias.html         (Fase 4)
│   ├── localidades.html        (Fase 4)
│   ├── caracteristicas.html    (Fase 4)
│   ├── configuracoes.html      (Fase 5)
│   ├── usuarios.html           (Fase 5)
│   ├── perfil.html             (Fase 5)
│   ├── offline.html
│   ├── manifest.json
│   ├── service-worker.js
│   ├── icons/
│   ├── css/admin.css
│   └── js/
│       ├── core/               api.js · ui.js · layout.js · session.js · format.js
│       └── pages/              login.js · dashboard.js · (properties.js, property-form.js…)
│
├── api/                        Endpoints JSON
│   ├── auth/                   login · logout · me
│   ├── dashboard/              stats
│   ├── properties/             (Fase 2/3) index · show · create · update · delete · duplicate · status · images…
│   ├── categories/  locations/  features/   (Fase 4)
│   ├── settings/  users/  profile/          (Fase 5)
│   └── public/                 (Fase 6) endpoints SEM login, só leitura, só dados publicados
│
├── app/                        Núcleo PHP (bloqueado via .htaccess + guarda APP_ROOT)
│   ├── bootstrap.php
│   └── Core/                   Env · Database · Request · Response · Session · Auth · Csrf ·
│                               Validator · ActivityLog · Str · HttpException
│
├── config/                     Bloqueado via .htaccess
│   ├── config.php              Constantes da aplicação (sem segredos)
│   └── database.example.php    Alternativa ao .env (versionado, sem senha)
├── .env                        Credenciais reais (NÃO versionado) — ver README, seção 3
│
├── database/database.sql       Schema completo + dados iniciais (bloqueado)
├── scripts/create-admin.php    Criação do 1º admin via terminal (bloqueado na web)
├── install/index.php           Instalador web de uso único (apagar após usar)
├── uploads/properties/         Fotos (PHP bloqueado aqui dentro)
└── docs/                       Documentação (bloqueada na web)
```

---

## 3. Banco de dados (MySQL 5.7+ / MariaDB 10.3+, InnoDB, utf8mb4)

```
users ─────────────┐
  │ 1:N            │ 1:N
password_resets    activity_logs
login_attempts (sem FK — registra também e-mails inexistentes)

property_types ─┐
cities ─┬───────┤
        │ 1:N   │
neighborhoods ──┤
                ▼
            properties ──1:N── property_images
                │  └── cover_image_id → property_images.id (SET NULL)
                └──N:N── features   (via property_features)

site_settings (chave/valor)
```

Decisões:
- **`code`** (`IMO-0001`) é gerado a partir do `id` dentro da mesma transação → nunca duplica. Coluna `UNIQUE`.
- **`slug`** `UNIQUE`; em colisão recebe sufixo `-2`, `-3`…
- **Soft delete** com `deleted_at` em `properties`. Toda consulta filtra `deleted_at IS NULL`.
- **Status**: `disponivel · reservado · vendido · alugado · indisponivel · rascunho`.
  Publicado = `status <> 'rascunho'` **e** `published_at IS NOT NULL` **e** `deleted_at IS NULL`.
  Carrossel = publicado + `featured = 1` + `status = 'disponivel'`.
- **Valores** em `DECIMAL(14,2)` (nunca FLOAT para dinheiro).
- **Imagens**: arquivo físico com nome UUID; variantes `-lg.webp`, `-md.webp`, `-sm.webp`; `sort_order` para ordenação.
- **Características** normalizadas (`features` + `property_features`), nada de texto livre.
- **Localidades**: `cities` (com UF) → `neighborhoods`.
- **Configurações**: `site_settings` chave/valor → adicionar campo novo não exige alterar schema.
- **Recuperação de senha**: `password_resets` guarda apenas o **hash** do token, com expiração e uso único.
- **Auditoria**: `activity_logs` (quem, ação, entidade, id, detalhes, IP, quando).

---

## 4. Fluxo de autenticação

```
login.html ──POST /api/auth/login.php {email, password}
               │ 1. valida formato (servidor)
               │ 2. rate limit: 5 falhas / 15 min por e-mail+IP → 429
               │ 3. busca usuário ativo (prepared statement)
               │ 4. password_verify (hash "falso" se usuário não existe → tempo constante)
               │ 5. session_regenerate_id(true) + novo token CSRF
               │ 6. registra last_login_at + activity_log
               ▼
           200 {user, csrf_token}  → painel guarda o token só em memória

Qualquer página do painel ──GET /api/auth/me.php
               │ sessão válida? (inatividade 2h / absoluto 12h / usuário ainda ativo no banco)
               ├── não → 401 → JS redireciona para login.html
               └── sim → {user, csrf_token}

Operações de escrita ── header X-CSRF-Token + cookie de sessão
               │ Auth::requireUser()  → 401
               │ Auth::requireRole()  → 403
               │ Csrf::verify()       → 403 {errors:{csrf}}
               │ Validator            → 422 {errors}
               ▼
           PDO prepared statements

Sair ──POST /api/auth/logout.php (CSRF) → destrói sessão + cookie → login.html
```

Cookie de sessão: `HttpOnly`, `SameSite=Lax`, `Secure` automático em HTTPS, `use_strict_mode`, nome próprio.
O JavaScript **nunca** decide permissão: ele só esconde itens de menu; o servidor valida tudo.

---

## 5. Fluxo painel → API → banco → site

```
PAINEL (admin/*.html + JS)                SITE PÚBLICO (index.html + main.js)
        │ fetch + sessão + CSRF                    │ fetch (sem login, só leitura)
        ▼                                          ▼
/api/properties/*  /api/settings/*        /api/public/properties.php
/api/categories/*  …                      /api/public/settings.php
        │ Auth + Validator + PDO                   │ só registros publicados
        ▼                                          ▼
                  ─────────  MySQL  ─────────
```

O cliente marca **"Exibir como destaque"** → `featured = 1` → `/api/public/properties.php?featured=1` → carrossel da Home. Nenhum HTML é editado.

---

## 6. Plano de implementação e alterações

| Fase | Entregas | Status |
|---|---|---|
| 1 | `database.sql`, config, núcleo PHP, login/logout/sessão, dashboard base, `.htaccess`, 1º admin | ✅ |
| 2 | CRUD de imóveis: listagem com filtros/paginação, formulário em 6 etapas, rascunho/publicar, autosave, duplicar, soft delete | ✅ |
| 3 | Upload múltiplo (galeria/câmera), GD → WebP lg/md/sm, capa, reordenar (arrastar + setas) | ✅ |
| 4 | Categorias, características, cidades e bairros (bairro também criado direto no formulário) | ✅ |
| 5 | Configurações do site (contatos, redes, CRECI, logo, favicon), usuários admin/editor, meu perfil/senha | ✅ |
| 6a | API pública `/api/public/*` (imóveis, detalhe, configurações, filtros) | ✅ |
| 7 | PWA (manifest, service worker sem cache de dados, ícones, offline, instalar), responsivo | ✅ |
| **Banco** | Criar na Hostinger e importar `database.sql` | ⏭ última etapa |
| 6b | Home consumindo a API (carrossel, grid, filtros, WhatsApp/contatos) + `imovel.html` | ⏭ após o banco |

## Zonas e preço "a partir de" (28/09/2026)

- `neighborhoods.zone`: `sul | oeste | norte | leste | centro` (ou vazio). Editada em **Bairros / localidades** ou no cadastro do imóvel (campo Zona, gravado no bairro).
- `properties.price_from`: quando ligado, o site mostra "A partir de R$ …" (cards, página do imóvel e barra do celular).
- Site: só venda, filtro principal por **Zona** (abas) → **Bairro** (dependente da zona) → Tipo/Quartos; Vagas e Área em "Mais filtros". Faixa de preço removida.
- API pública: `properties.php?zone=sul`; `filters.php` devolve `zones` e a zona de cada bairro.
